<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use App\Models\UserProfile;

class AdminProfileController extends Controller
{
    /**
     * Display the specified admin profile.
     */
    public function show(Request $request)
    {
        $user = $request->user();
        $profile = UserProfile::where('user_id', $user->id)->first();

        $responseData = array_merge(
            $user->toArray(),
            $profile ? $profile->toArray() : [
                'department' => '',
                'birthdate' => null,
                'sex' => '',
                'house_num' => '',
                'street' => '',
                'barangay' => '',
                'city' => '',
                'province' => '',
                'country' => '',
                'zipcode' => '',
                'profile_picture' => null,
                'profile_picture_url' => null,
            ]
        );

        return response()->json($responseData);
    }

    /**
     * Update the specified admin profile.
     */
    public function update(Request $request)
    {
        $user = $request->user();

        DB::beginTransaction();

        try {
            // Update base user data
            $user->update($request->only([
                'first_name', 
                'last_name', 
                'middle_name', 
                'suffix_name'
            ]));

            // Prepare profile data
            $profileData = $request->only([
                'house_num', 
                'street', 
                'barangay', 
                'city', 
                'province', 
                'country', 
                'zipcode', 
                'department',
                'birthdate', 
                'sex'
            ]);

            // Handle Profile Picture Upload
            if ($request->hasFile('profile_picture')) {
                $file = $request->file('profile_picture');
                $path = $file->store('profile_pictures', 'public');
                $profileData['profile_picture'] = $path;
                
                // Delete old picture if it exists
                $currentProfile = UserProfile::where('user_id', $user->id)->first();
                if ($currentProfile && $currentProfile->profile_picture) {
                    Storage::disk('public')->delete($currentProfile->profile_picture);
                }
            }

            // Update or create the profile
            $updatedProfile = UserProfile::updateOrCreate(
                ['user_id' => $user->id],
                $profileData
            );

            DB::commit();

            return response()->json([
                'message' => 'Profile updated successfully',
                'profile_picture_url' => $updatedProfile->profile_picture_url
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to update profile', 
                'error' => $e->getMessage()
            ], 500);
        }
    }
}