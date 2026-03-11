<?php

namespace App\Http\Controllers;

use App\Services\AuditLogger;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\Hash;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\SignatureInvalidException;
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
        $request->validate([
            'client_id' => 'required|string',
            'client_secret' => 'required|string',
            'code' => 'required|string',
        ]);

        $clientId = $request->input('client_id');
        $clientSecret = $request->input('client_secret');
        $code = $request->input('code');

        $publicKey = env('IDP_PUBLIC_KEY');
              
        // Placeholder return
        $payload = [
            'client_id'     => $clientId,
            'client_secret' => $clientSecret,
            'code'          => $code,
            // 'grant_type'    => 'authorization_code',
            // 'redirect_uri'  => 'https://your-app.com/callback' 
        ];

        $idpUrl = 'https://internal-idp.local/auth/token';

        $publicKey = env('IDP_PUBLIC_KEY');

        $ch = curl_init($idp_url);

        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); 
        curl_setopt($ch, CURLOPT_POST, true); 
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($payload));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Accept: application/json'
        ]);

        $response = curl_exec($ch);

        // Error handling
        if (curl_errno($ch)) {
            Log::error('cURL error while communicating with IDP: ' . curl_error($ch));
            return response()->json([
                'message' => 'Failed to communicate with the Identity Provider.',
            ], 500);
        } else {
            $responseData = json_decode($response, true);
            return response()->json([
                'message' => 'IDP callback handled successfully.',
                'data' => $responseData,
            ]);
        }
        
        curl_close($ch);
    }
}