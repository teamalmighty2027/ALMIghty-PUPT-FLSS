<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
<<<<<<< HEAD

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

=======
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
>>>>>>> bc930bb6c46df52076b60341f075a51f3906ed44
    public function update(Request $request)
    {
        $user = $request->user();

        DB::beginTransaction();

        try {
<<<<<<< HEAD
            $user->update($request->only(['first_name', 'last_name', 'middle_name', 'suffix_name']));

            // For now, admins don't have additional profile fields like faculty
            // In the future, we could create an AdminProfile model and handle additional fields
=======
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
>>>>>>> bc930bb6c46df52076b60341f075a51f3906ed44

            DB::commit();

            return response()->json([
                'message' => 'Profile updated successfully',
<<<<<<< HEAD
                'profile_picture_url' => null
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to update profile', 'error' => $e->getMessage()], 500);
=======
                'profile_picture_url' => $updatedProfile->profile_picture_url
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to update profile', 
                'error' => $e->getMessage()
            ], 500);
>>>>>>> bc930bb6c46df52076b60341f075a51f3906ed44
        }
    }
}