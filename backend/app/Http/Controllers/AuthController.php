<?php

namespace App\Http\Controllers;

use App\Services\AuditLogger;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\Hash;
use Exception;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    /**
     * Handle login and issue a role-based session token.
     */
    public function login(Request $request)
    {
        $loginUserData = $request->validate([
            'email'         => 'required|string|email|max:254',
            'password'      => 'required|string|min:8|max:128',
            'allowed_roles' => 'required|array',
        ]);

        // Check if the user exists and the password is correct
        // Eager load permissions and allowed programs to avoid N+1 queries
        $user = User::with(['faculty.facultyType', 'permissions', 'allowedPrograms'])
            ->where('email', $loginUserData['email'])
            ->whereIn('role', $loginUserData['allowed_roles'])
            ->first();

        if (! $user || ! Hash::check($loginUserData['password'], $user->password)) {
            return response()->json([
                'message' => 'Invalid credentials. Check your email and password.',
            ], 401);
        }

        // Check if user has allowed role
        if (! in_array($user->role, $loginUserData['allowed_roles'])) {
            return response()->json([
                'message' => 'Access forbidden. You are not authorized as ' . 
                implode(' or ', $loginUserData['allowed_roles']) . '.',
            ], 403);
        }

        // Check if admin/superadmin is active
        if (($user->role === 'admin' || $user->role === 'superadmin') && $user->status === 'Inactive') {
            return response()->json([
                'message' => 'Your account is currently inactive. Please contact the system administrator.',
            ], 403);
        }

        $expiration = $this->getRoleExpiration($user->role);
        $cookieMinutes = $this->getCookieMinutes($expiration);
        $tokenResult = $user->createToken('user-token', ['*'], $expiration);
        $token = $tokenResult->plainTextToken;

        $faculty = $user->faculty;

        // Get permissions and allowed programs for response
        $permissions = $user->permissions->pluck('permission_key')->toArray();
        $allowedPrograms = $user->getAllowedProgramIds();
        $isFullAccess = $user->isFullAccess();

        // Prepare user data to be stored in the cookie
        $userData = json_encode([
            'id'               => $user->id,
            'name'             => $user->first_name . ' ' . $user->last_name,
            'email'            => $user->email,
            'role'             => $user->role,
            'roles'            => [$user->role],
            'permissions'      => $permissions,
            'allowed_programs' => $allowedPrograms,
            'is_full_access'   => $isFullAccess,
            'faculty'          => $faculty ? [
                'faculty_id'    => $faculty->id,
                'faculty_email' => $user->email,
                'faculty_type'  => $faculty->facultyType->faculty_type ?? null,
                'faculty_units' => $faculty->faculty_units,
            ] : null,
        ]);

        // Store the token and user info in cookies
        Cookie::queue(
            Cookie::make('user_token', $token, $cookieMinutes, null, null, true, true)
        );
        Cookie::queue(Cookie::make('user_info', $userData, $cookieMinutes));

        // AuditLogger automatically grabs their Name, Role, and ID
        Auth::setUser($user);

        // ══════════════════════════════════════════════════════════
        // ← LOG LOGIN ACTION
        // ══════════════════════════════════════════════════════════
        AuditLogger::logLogin($loginUserData['email']);

        return response()->json([
            'message'    => 'Login successful.',
            'expires_at' => $expiration->toIso8601String(),
            'token'      => $token,
            'user'       => json_decode($userData, true),
        ])
        ->cookie('token', $token, $cookieMinutes, null, null, true, true);
    }

    /**
     * Handle logout by revoking the current token and clearing cookies.
     */
    public function logout(Request $request)
    {
        if ($request->user()) {
            // ══════════════════════════════════════════════════════════
            // ← LOG LOGOUT ACTION (before revoking token)
            // ══════════════════════════════════════════════════════════
            AuditLogger::logLogout();

            // Revoke the token that was used to authenticate the current request
            $token = $request->user()->currentAccessToken();

            // Check if token exists and has a delete method
            if ($token && method_exists($token, 'delete')) {
                $token->delete();
            }

            // Clear the cookies
            Cookie::queue(Cookie::forget('user_token'));
            Cookie::queue(Cookie::forget('user_info'));
            Cookie::queue(Cookie::forget('token'));

            return response()->json(['message' => 'Logged out successfully.'], 200);
        }

        return response()->json(['message' => 'Unauthenticated.'], 401);
    }

    public function changePassword(Request $request)
    {
        $request->validate([
            'current_password' => 'required|string|min:8|max:128',
            'password'         => 'required|string|min:8|max:128|confirmed|different:current_password',
        ]);

        $user = $request->user();

        // Verify current password
        if (! Hash::check($request->current_password, $user->password)) {
            return response()->json([
                'message' => 'Current password is incorrect.',
                'errors'  => ['current_password' => ['The provided password does not match our records.']],
            ], 422);
        }

        $oldPassword = $user->password; // Store for audit

        // Update password
        $user->password = $request->password;
        $user->save();

        // ══════════════════════════════════════════════════════════
        // ← LOG PASSWORD CHANGE
        // ══════════════════════════════════════════════════════════
        AuditLogger::log(
            action: 'update',
            description: "User {$user->email} changed their password",
            model: 'User',
            modelId: $user->id,
            metadata: ['action_type' => 'password_change']
        );

        return response()->json([
            'message' => 'Your password has been changed successfully.',
        ]);
    }

    /**
     * Refreshes the user's token by validating the existing token 
     * and issuing a new one with extended expiration.
     */
    public function refreshToken(Request $request)
    {
        $plainTextToken = $this->getPlainTextToken($request);

        if (! $plainTextToken) {
            return response()->json([
                'message' => 'Missing token.',
            ], 401);
        }

        $accessToken = PersonalAccessToken::findToken($plainTextToken);

        if (! $accessToken) {
            return response()->json([
                'message' => 'Invalid token.',
            ], 401);
        }

        if ($accessToken->expires_at && Carbon::now()->greaterThan($accessToken->expires_at)) {
            $accessToken->delete();

            return response()->json([
                'message' => 'Token expired.',
            ], 401);
        }

        $user = $accessToken->tokenable;

        if (! $user) {
            return response()->json([
                'message' => 'Unauthenticated.',
            ], 401);
        }

        $expiration = $this->getRoleExpiration($user->role);
        $cookieMinutes = $this->getCookieMinutes($expiration);
        $tokenResult = $user->createToken('user-token', ['*'], $expiration);
        $newToken = $tokenResult->plainTextToken;

        $accessToken->delete();

        return response()->json([
            'message' => 'Token refreshed.',
            'token' => $newToken,
            'expires_at' => $expiration->toIso8601String(),
        ])
        ->cookie('token', $newToken, $cookieMinutes, null, null, true, true);
    }

    //
    // Authentication functions related to IDP System
    //

    /**
     * Handles the callback from the IDP after successful authentication
     * Draft implementation based on the expected JWT structure and validation requirements
     */  
    public function handleIdpCallback(Request $request)
    {
        $request->validate([
            'code'          => 'required|string',
            'request_role'  => 'nullable|array',
            'request_role.*'=> 'string|in:faculty,admin,superadmin',
        ]);

        $baseUrl = config('services.idp.base_url');
        $code = $request->input('code');
        $requestedRole = $request->input('request_role', []);
        $clientId = config('services.idp.client_id');
        $clientSecret = config('services.idp.client_secret');

        // Validate configuration before proceeding
        if (!$baseUrl || !$clientId || !$clientSecret) {
            Log::error('IDP Configuration missing at callback');
            return response()->json([
              'message' => 'Authentication configuration error.'
            ], 500);
        }

        // --- STEP 1: EXCHANGE CODE FOR TOKEN ---        
        $tokenResponse = Http::withoutVerifying()->asJson()->post(
            rtrim($baseUrl, '/') . '/api/v1/auth/token',
            [
                'client_id'     => $clientId,
                'client_secret' => $clientSecret,
                'code'          => $code,
            ]
        );
        
        try {
            if (!$tokenResponse->successful()) {
                $errorBody = $tokenResponse->json();
                $detailedError = $errorBody['error'] ?? 
                  $tokenResponse->body() ?: 'Token exchange failed.';
                
                Log::warning("IDP token exchange failed for client {$clientId}: " . $detailedError);
                
                return response()->json([
                    'message' => 'Authentication failed. Please try again.',
                    'error'   => true
                ], 401);
            }   

            // --- STEP 2: Verify Token and Fetch User Data ---
            $token = $tokenResponse->json() ?? null;
            $accessToken = $token['access_token'] ?? null;
            $meResponse = Http::withoutVerifying()->withToken($accessToken)->get(
                rtrim($baseUrl, '/') . '/api/v1/me'
            );

            if (!$meResponse->successful()) {
                $errorBody = $meResponse->json();
                $detailedError = is_array($errorBody) && isset($errorBody['error'])
                    ? $errorBody['error']
                    : 'Failed to fetch user data from IDP.';

                Log::warning("IDP user data fetch failed for client {$clientId}: " . $detailedError);

                return response()->json([
                    'error'   => true,
                    'message' => 'Failed to retrieve user information. Please try again.',
                ], 401);
            }

            $userData = $meResponse->json();

            if (!is_array($userData) || !isset($userData['email'])) {
                return response()->json([
                    'message' => 'Invalid user data received from IDP.',
                    'error'   => true
                ], 401);
            }

            $id = $userData['id'] ?? null;
            $email = $userData['email'] ?? null;
            $firstName = $userData['first_name'] ?? '';
            $middleName = $userData['middle_name'] ?? '';
            $lastName = $userData['last_name'] ?? '';

            // Query user by email
            $user = User::with(['faculty.facultyType'])
              ->where('email', $email)
              ->whereIn('role', $requestedRole)
              ->first();

            // Persist the IDP user ID on the faculty record only if it has changed
            if ($user && $user->faculty && $id && strlen($id) <= 36) {
                if ($user->faculty->idp_user_id !== $id) {
                    $user->faculty->update(['idp_user_id' => $id]);
                }
            }

            // Collect the roles of the user
            $roles = $user ? [$user->role] : [];

            if (!$user) {
                return response()->json([
                    'message' => 'User not found in system.',
                    'error'   => true
                ], 401);
            }

            if (! in_array($user->role, $requestedRole)) {
                return response()->json([
                    'message' => 'Access forbidden. You are not authorized as ' . 
                        implode(' or ', $requestedRole) . '.',
                    'error'   => true
                ], 403);
            }

            // Use the earlier of IDP expiry and role-based expiry.
            $expiresIn = $token['expires_in'] ?? 3600;
            $idpExpiresAt = Carbon::now()->addSeconds($expiresIn);
            $roleExpiresAt = $this->getRoleExpiration($user->role);
            $expiresAt = $idpExpiresAt->lessThan($roleExpiresAt)
                ? $idpExpiresAt
                : $roleExpiresAt;
            $expiration = $this->getCookieMinutes($expiresAt);

            $tokenResult = $user->createToken('iDP-user-token', ['*'], $expiresAt);
            $sanctumToken = $tokenResult->plainTextToken;

            // Get permissions and allowed programs for response
            $permissions = $user->permissions->pluck('permission_key')->toArray();
            $allowedPrograms = $user->getAllowedProgramIds();
            $isFullAccess = $user->isFullAccess();

            // Prepare user data
            $userDataArray = [
                'id'               => $user->id,
                'name'             => $user->first_name . ' ' . $user->last_name,
                'email'            => $user->email,
                'roles'            => $roles,
                'permissions'      => $permissions,
                'allowed_programs' => $allowedPrograms,
                'is_full_access'   => $isFullAccess,
            ];

            if ($user->role === 'superadmin') {
                $userDataArray['role'] = 'superadmin';
            } else if (in_array('faculty', $requestedRole)) {                
                // Add to user data if faculty
                $userDataArray['role'] = 'faculty';
                $userDataArray['faculty'] = $user->faculty ? [
                    'faculty_id'    => $user->faculty->id,
                    'faculty_email' => $user->email,
                    'faculty_type'  => $user->faculty->facultyType->faculty_type ?? null,
                    'faculty_units' => $user->faculty->faculty_units,
                ] : null;
            } else if (in_array('admin', $requestedRole)) {
                $userDataArray['role'] = 'admin';
            }

            $userDataJson = json_encode($userDataArray);

            // AuditLogger automatically grabs their Name, Role, and ID
            Auth::setUser($user);
            AuditLogger::logLogin($email);

            return response()->json([
                'message' => 'IDP authentication successful.',
                'token' => $sanctumToken,
                'expires_at' => $expiresAt->toIso8601String(),
                'user' => $userDataArray,
                'idp' => [
                    'access_token' => $accessToken,
                    'refresh_token' => $token['refresh_token'] ?? null,
                    'expires_in' => $expiresIn,
                ],
            ])
            ->cookie('token', $sanctumToken, $expiration, null, null, true, true)
            ->cookie('user_info', $userDataJson, $expiration);
        } catch (Exception $e) {
            Log::error('Error handling IDP callback: ' . $e->getMessage());
            return response()->json([
                'message' => 'Authentication failed.'
            ], 401);
        }    
    }

    /**
     * Proxy logout request to the IDP to avoid browser CORS issues.
     */
    public function logoutIdpProxy(Request $request)
    {
        $baseUrl = config('services.idp.base_url');
        $clientId = config('services.idp.client_id') ?: $request->query('client_id');
        $logoutPath = '/api/v1/auth/logout';

        if (! $baseUrl || ! $clientId) {
            Log::error('IDP Configuration missing for logout proxy');
            return response()->json([
                'message' => 'IDP configuration is missing.',
            ], 500);
        }

        try {
            $logoutUrl = rtrim($baseUrl, '/') . $logoutPath;
            
            // Get IDP token from request body
            $idpToken = $request->input('idp_token');

            if (empty($idpToken)) {
                Log::warning('IDP logout proxy called without token');
                return response()->json([
                    'message' => 'IDP token is missing.',
                ], 400);
            }

            $requestHttp = Http::withoutVerifying()->asJson();

            if ($idpToken) {
                $requestHttp = $requestHttp->withToken($idpToken);
            }

            $response = $requestHttp->post(
                $logoutUrl,
                ['client_id' => $clientId]
            );

            if (! $response->successful()) {
                Log::warning('IDP logout proxy failed with status ' . 
                  $response->status() . 
                  ': ' . 
                  $response->body()
                );
                return response()->json([
                    'message' => 'IDP logout failed.',
                    'status' => $response->status(),
                ], 502);
            }

            return response()->json([
                'message' => 'IDP logout successful.',
                'data' => $response->json(),
            ], 200);
        } catch (Exception $e) {
            Log::error('Error during IDP logout proxy: ' . $e->getMessage());
            return response()->json([
                'message' => 'IDP logout proxy failed.',
            ], 502);
        }
    }

    /**
     * Helper function to extract the plain text token from 
     * either the Authorization header or cookies.
     */
    private function getPlainTextToken(Request $request): ?string
    {
        $bearerToken = $request->bearerToken();

        if ($bearerToken) {
            return $bearerToken;
        }

        $cookieToken = $request->cookie('token') ?? $request->cookie('user_token');

        return $cookieToken ?: null;
    }

    /**
     * Resolve the role-based session expiration.
     */
    private function getRoleExpiration(string $role): Carbon
    {
        if ($role === 'admin' || $role === 'superadmin') {
            return Carbon::now()->addDays(5);
        }

        return Carbon::now()->addHours(24);
    }

    /**
     * Convert an expiration into cookie minutes.
     */
    private function getCookieMinutes(Carbon $expiresAt): int
    {
        $seconds = Carbon::now()->diffInSeconds($expiresAt);

        return (int) ceil($seconds / 60);
    }
}
