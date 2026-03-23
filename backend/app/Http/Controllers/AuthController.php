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

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $loginUserData = $request->validate([
            'email'         => 'required|string|email|max:254',
            'password'      => 'required|string|min:8|max:128',
            'allowed_roles' => 'required|array',
        ]);

        // Check if the user exists and the password is correct
        $user = User::with(['faculty.facultyType'])->where('email', $loginUserData['email'])->first();

        if (! $user || ! Hash::check($loginUserData['password'], $user->password)) {
            return response()->json([
                'message' => 'Invalid credentials. Check your email and password.',
            ], 401);
        }

        // Check if user has allowed role
        if (! in_array($user->role, $loginUserData['allowed_roles'])) {
            return response()->json([
                'message' => 'Access forbidden. You are not authorized as ' . implode(' or ', $loginUserData['allowed_roles']) . '.',
            ], 403);
        }

        // Check if admin/superadmin is active
        if (($user->role === 'admin' || $user->role === 'superadmin') && $user->status === 'Inactive') {
            return response()->json([
                'message' => 'Your account is currently inactive. Please contact the system administrator.',
            ], 403);
        }

        $tokenResult = $user->createToken('user-token');
        $token       = $tokenResult->plainTextToken;
        $expiration  = Carbon::now()->addHours(24);

        $faculty = $user->faculty;

        // Prepare user data to be stored in the cookie
        $userData = json_encode([
            'id'      => $user->id,
            'name'    => $user->first_name . ' ' . $user->last_name,
            'email'   => $user->email,
            'role'    => $user->role,
            'faculty' => $faculty ? [
                'faculty_id'    => $faculty->id,
                'faculty_email' => $user->email,
                'faculty_type'  => $faculty->facultyType->faculty_type ?? null,
                'faculty_units' => $faculty->faculty_units,
            ] : null,
        ]);

        // Store the token and user info in cookies
        Cookie::queue(Cookie::make('user_token', $token, 1440, null, null, true, true));
        Cookie::queue(Cookie::make('user_info', $userData, 1440));

        // AuditLogger automatically grabs their Name, Role, and ID
        Auth::setUser($user);

        // ══════════════════════════════════════════════════════════
        // ← LOG LOGIN ACTION
        // ══════════════════════════════════════════════════════════
        AuditLogger::logLogin($loginUserData['email']);

        return response()->json([
            'message'    => 'Login successful.',
            'expires_at' => $expiration,
            'token'      => $token,
            'user'       => json_decode($userData, true),
        ])
        ->cookie('token', $token, 1440, null, null, true, true);
    }

    public function logout(Request $request)
    {
        if ($request->user()) {
            // ══════════════════════════════════════════════════════════
            // ← LOG LOGOUT ACTION (before revoking token)
            // ══════════════════════════════════════════════════════════
            AuditLogger::logLogout();

            // Revoke the token that was used to authenticate the current request
            $request->user()->currentAccessToken()->delete();

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

        $baseUrl = env('IDP_BASE_URL');
        $code = $request->input('code');
        $requestedRole = $request->input('request_role', []);
        $clientId = env('CLIENT_ID');
        $clientSecret = env('CLIENT_SECRET');

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
                $errorMessage = is_array($errorBody) && isset($errorBody['error'])
                    ? $errorBody['error']
                    : 'Token exchange failed.';
                
                return response()->json([
                    'message' => 'IDP session has expired. Please log in again.'
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
                $errorMessage = is_array($errorBody) && isset($errorBody['error'])
                    ? $errorBody['error']
                    : 'Failed to fetch user data from IDP.';

                return response()->json([
                    'error'   => True,
                    'message' => $errorMessage
                ], 401);
            }

            $userData = $meResponse->json();

            if (!is_array($userData) || !isset($userData['email'])) {
                return response()->json([
                    'message' => 'Invalid user data received from IDP.'
                ], 401);
            }

            $id = $userData['id'] ?? null;
            $email = $userData['email'] ?? null;
            $firstName = $userData['first_name'] ?? '';
            $middleName = $userData['middle_name'] ?? '';
            $lastName = $userData['last_name'] ?? '';
            $roles = $userData['roles'] ?? [];
            $user = null;

            // Validate roles data
            if (empty($roles) || !is_array($roles)) {
                return response()->json([
                    'message' => 'Invalid roles data received from IDP.'
                ], 401);
            }

            // Check database for user with matching email and role
            if (in_array('FLSS:faculty', $roles)) {
                $user = User::with(['faculty.facultyType'])->where('email', $email)->first();
            } else if (in_array('FLSS:admin', $roles)) {
                $user = User::where('email', $email)->first();
            } else {
                $user = User::where('email', $email)->first();
            }

            if (!$user) {
                return response()->json([
                    'message' => 'User not found in system.',
                    'error'   => true
                ], 401);
            }

            $tokenResult = $user->createToken('iDP-user-token');
            $sanctumToken = $tokenResult->plainTextToken;

            // Use IDP token expiry for Sanctum token expiry
            $expiresIn = $token['expires_in'] ?? 3600;
            $expiration = (int) ceil($expiresIn / 60);

            // Prepare user data
            $userDataArray = [
                'id'      => $user->id,
                'name'    => $user->first_name . ' ' . $user->last_name,
                'email'   => $user->email,
                'roles'   => $roles
            ];

            if (in_array('FLSS:faculty', $roles)) {                
                // Add to user data if faculty
                $userDataArray['role'] = in_array('faculty', $requestedRole) ? 'faculty' : null;
                $userDataArray['faculty'] = $user->faculty ? [
                    'faculty_id'    => $user->faculty->id,
                    'faculty_email' => $user->email,
                    'faculty_type'  => $user->faculty->facultyType->faculty_type ?? null,
                    'faculty_units' => $user->faculty->faculty_units,
                ] : null;
            } else if (in_array('FLSS:admin', $roles)) {                
                $userDataArray['role'] = in_array('admin', $requestedRole) ? 'admin' : null;
            } else if (in_array('FLSS:superadmin', $roles)) {
                $userDataArray['role'] = in_array('superadmin', $requestedRole) ? 'superadmin' : null;
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
            ->cookie('token', $sanctumToken, $expiration, null, null, true, true)
            ->cookie('user_info', $userDataJson, $expiration);
        } catch (Exception $e) {
            Log::error('Error handling IDP callback: ' . $e->getMessage());
            return response()->json([
                'message' => 'Authentication failed.'
            ], 401);
        }    
    }
}
