<?php

namespace App\Http\Controllers;

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

        // Update password
        $user->password = $request->password;
        $user->save();

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
            'idp_token' => 'required|string'
        ]);

        $idpToken = $request->input('idp_token');
        
        // Fetch these from your .env file
        $publicKey = env('PUPT_IDP_PUBLIC_KEY'); 
        $expectedAudience = env('PUPT_IDP_CLIENT_ID');

        try {
            // 1. Decode and Verify the Signature (RS256)
            $decodedToken = JWT::decode($idpToken, new Key($publicKey, 'RS256')); 

            // 2. Verify the Issuer
            if ($decodedToken->iss !== 'unified-access-idp') {
                return response()->json([
                    'message' => 'Invalid token issuer.'
                ], 401);
            }

            // 3. Verify the Audience (Handling the array format shown in the image)
            $tokenAudiences = is_array($decodedToken->aud) ? $decodedToken->aud : [$decodedToken->aud];
            if (!in_array($expectedAudience, $tokenAudiences)) {
                return response()->json([
                    'message' => 'Invalid token audience.'
                ], 401);
            }

            // 4. Extract Custom Claims
            $idpUserId = $decodedToken->userId;
            $email = $decodedToken->email;
            $firstName = $decodedToken->firstName;
            $lastName = $decodedToken->lastName;
            $roles = $decodedToken->roles; 
            // Array like ["idp:admin"]

            // 5. Match or Create the User in your PUPT-FLSS database
            $user = User::firstOrCreate(
                // The unique identifier from the IDP
                ['idp_id' => $idpUserId], 
                [
                    // Data to fill if the user is being created for the first time
                    'name' => trim($firstName . ' ' . $lastName),
                    'email' => $email,
                    'auth_provider' => 'unified-access-idp', // Placeholder
                ]
            );

            // Update the user's name/email in FLSS in case it changed on the IDP
            $user->update([
                'name' => trim($firstName . ' ' . $lastName),
                'email' => $email,
            ]);

            // 6. Generate the local Sanctum token
            $user->tokens()->delete();
            $localToken = $user->createToken('flss_angular_client')->plainTextToken;

            // 7. Return the token and user data to AngularJS
            return response()->json([
                'message' => 'Authentication successful',
                'access_token' => $localToken,
                'token_type' => 'Bearer',
                'user' => [
                    'name' => $user->name,
                    'email' => $user->email,
                    'roles' => $roles
                ]
            ], 200);

        } catch (ExpiredException $e) {
            return response()->json([
                'message' => 'IDP session has expired. Please log in again.'
            ], 401);
        } catch (SignatureInvalidException $e) {
            return response()->json([
                'message' => 'Token signature verification failed.'
            ], 401);
        } catch (Exception $e) {
            return response()->json([
                'message' => 'Authentication failed.', 'error' => $e->getMessage()
            ], 401);
        }    
    }
}
