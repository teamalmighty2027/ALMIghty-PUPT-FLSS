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
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    /**
     * Handle user login and issue a Sanctum token.
     */
    public function login(Request $request)
    {
        Log::info("Login initiated");
        $loginUserData = $request->validate([
            'email'         => 'required|string|email|max:254',
            'password'      => 'required|string|min:8|max:128',
            'allowed_roles' => 'required|array|min:1|max:3',
            'allowed_roles.*' => 'required|string|distinct|in:faculty,admin,superadmin',
        ]);

        $allowedRoles = array_values(array_unique($loginUserData['allowed_roles']));

        $user = User::with(['faculty.facultyType', 'permissions', 'allowedPrograms'])
            ->where('email', $loginUserData['email'])
            ->whereIn('role', $allowedRoles)
            ->first();

        if (! $user) {
            // Keep failed-login timing closer to existing-user checks.
            Hash::check($loginUserData['password'], '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/AT0jNhLx2fX2.');
            return $this->invalidLoginResponse();
        }

        if (! Hash::check($loginUserData['password'], $user->password)) {
            return $this->invalidLoginResponse();
        }

        // Check if user has allowed role
        if (! in_array($user->role, $allowedRoles, true)) {
            return $this->invalidLoginResponse();
        }

        // Block logins for inactive or retired accounts
        if ($user->status === 'Inactive' || $user->status === 'Retired') {
            AuditLogger::logFailedLogin(
                $loginUserData['email'],
                "Standard credentials login attempted for {$user->status} account",
                $user
            );

            return response()->json([
                'message' => 'Your account is currently ' . strtolower($user->status) . '. Please contact the system administrator.',
                'status'  => $user->status,
                'email'   => $user->email,
            ], 403);
        }
        
        Log::info("User role checked");

        $tokenResult = $user->createToken('user-token');
        $token       = $tokenResult->plainTextToken;
        $expiration  = Carbon::now()->addHour();

        $tokenResult->accessToken->expires_at = $expiration;
        $tokenResult->accessToken->save();

        $faculty = $user->faculty;
        Log::info("Faculty role: {$faculty}");

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
            'code'             => $user->code,
            'permissions'      => $permissions,
            'allowed_programs' => $allowedPrograms,
            'is_full_access'   => $isFullAccess,
            'faculty'          => $faculty ? [
                'faculty_id'    => $faculty->id,
                'faculty_email' => $user->email,
                'faculty_type'  => $faculty->facultyType?->faculty_type ?? null,
                'faculty_units' => $faculty->faculty_units,
            ] : null,
        ]);

        // Store the token and user info in cookies (60 minutes lifetime)
        Cookie::queue(
            Cookie::make('user_token', $token, 60, null, null, true, true)
        );
        Cookie::queue(Cookie::make('user_info', $userData, 60));

        // AuditLogger automatically grabs their Name, Role, and ID
        Auth::login($user);
        $request->session()->regenerate();

        // ══════════════════════════════════════════════════════════
        // ← LOG LOGIN ACTION
        // ══════════════════════════════════════════════════════════
        AuditLogger::logLogin($loginUserData['email']);

        return response()->json([
            'message'    => 'Login successful.',
            'expires_at' => $expiration,
            'token'      => $token,
            'user'       => json_decode($userData, true),
        ]);
    }

    /**
     * Return a generic failed login response.
     */
    private function invalidLoginResponse()
    {
        return response()->json([
            'message' => 'Invalid credentials.',
        ], 401);
    }

    /**
     * Log out the current user and revoke the active token.
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

    /**
     * Reissue a Sanctum token for the authenticated user.
     */
    public function refreshToken(Request $request)
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $currentToken = $user->currentAccessToken();

        if ($currentToken && method_exists($currentToken, 'save')) {
            $currentToken->expires_at = Carbon::now()->addMinute();
            $currentToken->save();
        }

        $tokenResult = $user->createToken('user-token');
        $token = $tokenResult->plainTextToken;
        $expiration = Carbon::now()->addHour();

        $tokenResult->accessToken->expires_at = $expiration;
        $tokenResult->accessToken->save();

        return response()->json([
            'message' => 'Token refreshed.',
            'expires_at' => $expiration,
            'token' => $token,
        ])
        ->cookie('token', $token, 60, null, null, true, true);
    }

    /**
     * Update the current user's password after validation.
     */
    public function changePassword(Request $request)
    {
        $request->validate([
            'current_password' => 'required|string|max:128',
            'password'         => [
                'required',
                'string',
                'confirmed',
                'different:current_password',
                Password::min(12)
                    ->mixedCase()
                    ->numbers()
                    ->symbols(),
            ],
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
            $user = User::where('email', $email)
              ->whereIn('role', $requestedRole)
              ->first();

            if (!$user) {
                return response()->json([
                    'message' => 'User not found in system.',
                    'error'   => true
                ], 401);
            }

            if ($user->status === 'Inactive' || $user->status === 'Retired') {
                AuditLogger::logFailedLogin(
                    $email,
                    "IDP login attempted for {$user->status} account",
                    $user
                );

                return response()->json([
                    'message' => 'Your account is currently ' . 
                        strtolower($user->status) . 
                        '. Please contact the system administrator.',
                    'error'   => true
                ], 403);
            }

            // Persist the IDP user ID on the faculty record only if it has changed
            if ($user && $user->faculty && $id && strlen($id) <= 36) {
                if ($user->faculty->idp_user_id !== $id) {
                    $user->faculty->update(['idp_user_id' => $id]);
                }
            }

            // Collect the roles of the user
            $roles = $user ? [$user->role] : [];

            if (! in_array($user->role, $requestedRole)) {
                return response()->json([
                    'message' => 'Access forbidden. You are not authorized as ' . 
                        implode(' or ', $requestedRole) . '.',
                    'error'   => true
                ], 403);
            }

            $tokenResult = $user->createToken('iDP-user-token');
            $sanctumToken = $tokenResult->plainTextToken;

            // Use IDP token expiry for Sanctum token expiry
            $expiresIn = $token['expires_in'] ?? 3600;
            $expiration = (int) ceil($expiresIn / 60);

            $expirationDateTime = Carbon::now()->addSeconds($expiresIn);
            $tokenResult->accessToken->expires_at = $expirationDateTime;
            $tokenResult->accessToken->save();

            // Get permissions and allowed programs for response
            $permissions = $user->permissions->pluck('permission_key')->toArray();
            $allowedPrograms = $user->getAllowedProgramIds();
            $isFullAccess = $user->isFullAccess();

            // Prepare user data
            $userDataArray = [
                'id'               => $user->id,
                'name'             => $user->first_name . ' ' . $user->last_name,
                'email'            => $user->email,
                'code'             => $user->code,
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
                'token'      => [
                    'token' => $sanctumToken,
                    'access_token' => $accessToken,
                    'refresh_token' => $token['refresh_token'] ?? null,
                    'expires_in'   => $expiresIn, 
                ],
                'data'       => $userDataArray,
            ])
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
     * Proxy that validates an existing IDP access_token and returns
     * routing info without requiring a new OAuth code exchange.
     * Mirrors handleIdpCallback but skips Step 1 (token exchange).
     */
    public function handleOnePortalRedirect(Request $request)
    {
        $baseUrl  = config('services.idp.base_url');
        $clientId = config('services.idp.client_id');

        // Validate required IDP config keys
        if (!$baseUrl || !$clientId) {
            Log::error('IDP configuration missing for redirect proxy');
            return response()->json([
                'message' => 'Authentication configuration error.',
            ], 500);
        }

        $idpToken = $request->query('idp_token');

        // No token present — signal the frontend to fall back
        if (empty($idpToken)) {
            return response()->json([
                'session'     => false,
                'redirect_to' => '/login',
            ]);
        }

        try {
            // --- Verify session via IDP /me endpoint ---
            $meResponse = Http::withoutVerifying()
                ->withToken($idpToken)
                ->get(rtrim($baseUrl, '/') . '/api/v1/me');

            if (!$meResponse->successful()) {
                Log::info(
                    'IDP session check returned non-2xx for redirect proxy'
                );
                return response()->json([
                    'session'     => false,
                    'redirect_to' => '/login',
                ]);
            }

            $idpData = $meResponse->json();

            if (!is_array($idpData) || !isset($idpData['email'])) {
                return response()->json([
                    'session'     => false,
                    'redirect_to' => '/login',
                ]);
            }

            $email     = $idpData['email'];
            $idpUserId = $idpData['id'] ?? null;

            // --- Find all FLSS users matching this email across roles ---
            $users = User::with([
                'faculty.facultyType',
                'permissions',
                'allowedPrograms',
            ])
                ->where('email', $email)
                ->whereIn('role', ['faculty', 'admin', 'superadmin'])
                ->get();

            if ($users->isEmpty()) {
                return response()->json([
                    'session'     => false,
                    'redirect_to' => '/login',
                ]);
            }

            $availableRoles = $users->pluck('role')
                ->unique()->values()->toArray();

            // --- Multiple roles: let the frontend show a role picker ---
            if (count($availableRoles) > 1) {
                return response()->json([
                    'session'                 => true,
                    'requires_role_selection' => true,
                    'available_roles'         => $availableRoles,
                    'data'                    => [
                        'email' => $email,
                        'name'  => ($idpData['first_name'] ?? '')
                                 . ' ' . ($idpData['last_name'] ?? ''),
                    ],
                ]);
            }

            // --- Single role: issue a Sanctum token and return ---
            $user = $users->first();

            if ($user->status === 'Inactive' || $user->status === 'Retired') {
                AuditLogger::logFailedLogin(
                    $email,
                    "OnePortal login attempted for {$user->status} account",
                    $user
                );

                return response()->json([
                    'session'     => false,
                    'message'     => 'Your account is currently ' . 
                        strtolower($user->status) . 
                        '. Please contact the administrator.',
                    'redirect_to' => '/login',
                ], 403);
            }

            // Persist IDP user ID on the faculty record if changed
            if (
                $user->faculty &&
                $idpUserId &&
                strlen($idpUserId) <= 36
            ) {
                if ($user->faculty->idp_user_id !== $idpUserId) {
                    $user->faculty->update(['idp_user_id' => $idpUserId]);
                }
            }

            $tokenResult  = $user->createToken('iDP-user-token');
            $sanctumToken = $tokenResult->plainTextToken;

            // Default to 1 hour since code exchange was skipped
            $expiresIn          = 3600;
            $expiration         = (int) ceil($expiresIn / 60);
            $expirationDateTime = Carbon::now()->addSeconds($expiresIn);

            $tokenResult->accessToken->expires_at = $expirationDateTime;
            $tokenResult->accessToken->save();

            $permissions     = $user->permissions
                ->pluck('permission_key')->toArray();
            $allowedPrograms = $user->getAllowedProgramIds();
            $isFullAccess    = $user->isFullAccess();

            // Build user data payload
            $userDataArray = [
                'id'               => $user->id,
                'name'             => $user->first_name
                                    . ' ' . $user->last_name,
                'email'            => $user->email,
                'code'             => $user->code,
                'roles'            => [$user->role],
                'permissions'      => $permissions,
                'allowed_programs' => $allowedPrograms,
                'is_full_access'   => $isFullAccess,
            ];

            if ($user->role === 'superadmin') {
                $userDataArray['role'] = 'superadmin';
            } elseif ($user->role === 'faculty') {
                $userDataArray['role']    = 'faculty';
                $userDataArray['faculty'] = $user->faculty ? [
                    'faculty_id'    => $user->faculty->id,
                    'faculty_email' => $user->email,
                    'faculty_type'  =>
                        $user->faculty->facultyType->faculty_type ?? null,
                    'faculty_units' => $user->faculty->faculty_units,
                ] : null;
            } else {
                $userDataArray['role'] = 'admin';
            }

            // Map role to the matching frontend dashboard path
            $redirectMap = [
                'faculty'    => '/faculty/home',
                'admin'      => '/admin',
                'superadmin' => '/superadmin',
            ];

            $redirectTo = $redirectMap[$user->role] ?? '/login';

            // Log the login event via audit logger
            Auth::setUser($user);
            AuditLogger::logLogin($email);

            return response()->json([
                'session'                 => true,
                'requires_role_selection' => false,
                'redirect_to'             => $redirectTo,
                'token'                   => [
                    'token'        => $sanctumToken,
                    'access_token' => $idpToken,
                    'expires_in'   => $expiresIn,
                ],
                'data' => $userDataArray,
            ])
            ->cookie(
                'token', $sanctumToken, $expiration, null, null, true, true
            )
            ->cookie('user_info', json_encode($userDataArray), $expiration);
        } catch (Exception $e) {
            Log::error(
                'Error in handleOnePortalRedirect: ' . $e->getMessage()
            );
            return response()->json([
                'session'     => false,
                'redirect_to' => '/login',
            ]);
        }
    }

    /**
     * Generates and returns the IDP authorization redirect URL.
     */
    public function getIdpLoginUrl()
    {
        $baseUrl = config('services.idp.base_url');
        $clientId = config('services.idp.client_id');

        if (!$baseUrl || !$clientId) {
            Log::error('IDP configuration missing for generating authorization URL');
            return response()->json([
                'message' => 'Authentication configuration error.',
            ], 500);
        }

        $url = rtrim($baseUrl, '/') . '/api/v1/auth/authorize?client_id=' . $clientId;

        return response()->json([
            'url' => $url,
        ]);
    }
}