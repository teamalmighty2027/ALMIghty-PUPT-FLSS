<?php

namespace App\Http\Controllers;

use App\Services\AuditLogger;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Exception;

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

        // Let Laravel know exactly who is logging in for this request
        // so the AuditLogger can automatically grab their Name, Role, and ID!
        \Illuminate\Support\Facades\Auth::setUser($user);

        // ══════════════════════════════════════════════════════════
        // ← LOG LOGIN ACTION
        // ══════════════════════════════════════════════════════════
        AuditLogger::logLogin($loginUserData['email']);

        return response()->json([
            'message'    => 'Login successful.',
            'token'      => $token,
            'expires_at' => $expiration,
            'user'       => json_decode($userData, true),
        ]);
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
     * Draft implementation of auth/token
     */  
    public function handleIdpCallback(Request $request)
    {
        // --- STEP 1: VALIDATE THE INCOMING CODE ---
        $request->validate([
            'client_id'     => 'required|string',
            'client_secret' => 'required|string',
            'code'          => 'required|string',
        ]);

        $baseUrl = 'https://identity-provider.isaxbsit2027.com/api/v1/';

        // --- STEP 2: EXCHANGE CODE FOR TOKEN ---        
        $tokenResponse = Http::withoutVerifying()->asJson()->post(
            rtrim($baseUrl, '/') . '/auth/token',
            [
                'client_id'     => $request->input('client_id'),
                'client_secret' => $request->input('client_secret'),
                'code'          => $request->input('code'),
            ]
        );

        Log::info('Token exchange response: ', ['status' => $tokenResponse->status(), 'body' => $tokenResponse->body()]);
        if (!$tokenResponse->successful()) {
            $errorBody = $tokenResponse->json();
            $errorMessage = is_array($errorBody) && isset($errorBody['error'])
                ? $errorBody['error']
                : 'Token exchange failed.';

            return response()->json([
                  'error'   => True,
                  'message' => $errorMessage
              ], 401);
        }

        $tokenData = $tokenResponse->json();

        $accessToken = $tokenData['access_token'] ?? null;
        $refreshToken = $tokenData['refresh_token'] ?? null;

        if (!$accessToken) {
            return response()->json([
                'error'   => True,
                'message' => 'Access token missing.'
            ], 401);
        }

        // --- STEP 3: FETCH USER DATA FROM /ME ---
        $meResponse = Http::withoutVerifying()->withToken($accessToken)->get(
            rtrim($baseUrl, '/') . '/api/v1/me'
        );

        if (!$meResponse->successful()) {
            $errorBody = $meResponse->json();
            $errorMessage = is_array($errorBody) && isset($errorBody['error'])
                ? $errorBody['error']
                : 'Unable to fetch user information.';

            return response()->json([
                'error'   => True,
                'message' => $errorMessage
            ], 401);
        }

        $userData = $meResponse->json();

        $id = $userData['id'] ?? null;
        $email = $userData['email'] ?? null;
        $firstName = $userData['first_name'] ?? '';
        $middleName = $userData['middle_name'] ?? '';
        $lastName = $userData['last_name'] ?? '';
        $roles = $userData['roles'] ?? [];

        $user = null;

        // Success! You now have the user's verified identity data.
        Log::info('Successfully fetched user data: ', (array) $userData);

        return response()->json([
            'message' => 'Authentication successful.',
            'user'    => $userData,
        ]);
    }
}