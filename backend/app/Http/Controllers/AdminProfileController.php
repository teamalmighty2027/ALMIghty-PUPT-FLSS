<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class AdminProfileController extends Controller
{
    public function show(Request $request)
    {
        $user = $request->user();

        // For admin, we don't have a separate profile table like faculty
        // So we return the user data directly
        // In the future, we could create an AdminProfile model if needed

        return response()->json([
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'middle_name' => $user->middle_name,
            'suffix_name' => $user->suffix_name,
            'email' => $user->email,
            'code' => $user->code,
            // Add any additional admin-specific fields here
            'department' => '', // Admins might not have departments
            'birthdate' => null,
            'sex' => null,
            'house_num' => null,
            'street' => null,
            'barangay' => null,
            'city' => null,
            'province' => null,
            'country' => null,
            'zipcode' => null,
            'profile_picture' => null,
            'profile_picture_url' => null,
        ]);
    }

    public function update(Request $request)
    {
        $user = $request->user();

        DB::beginTransaction();

        try {
            $user->update($request->only(['first_name', 'last_name', 'middle_name', 'suffix_name']));

            // For now, admins don't have additional profile fields like faculty
            // In the future, we could create an AdminProfile model and handle additional fields

            DB::commit();

            return response()->json([
                'message' => 'Profile updated successfully',
                'profile_picture_url' => null
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to update profile', 'error' => $e->getMessage()], 500);
        }
    }
}