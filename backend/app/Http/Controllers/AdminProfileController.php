<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use App\Models\UserProfile;
use Illuminate\Support\Facades\Log;

class AdminProfileController extends Controller
{
    public function show(Request $request)
    {
        try {
            $user = $request->user();
            $profile = UserProfile::where('user_id', $user->id)->first();

            $profileArray = [
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
            ];

            if ($profile) {
                $profileArray = array_merge($profileArray, $profile->toArray());
                
                // Convert raw database path into a full web URL for Admins
                if ($profile->profile_picture) {
                    $profileArray['profile_picture_url'] = url('storage/' . $profile->profile_picture);
                }
            }

            $responseData = array_merge($user->toArray(), $profileArray);

            return response()->json($responseData);
            
        } catch (\Exception $e) {
            Log::error('Admin Profile GET Error: ' . $e->getMessage());
            return response()->json(['error' => 'Internal Server Error', 'details' => $e->getMessage()], 500);
        }
    }

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

            $profileData = $request->only([
                'house_num', 'street', 'barangay', 'city', 
                'province', 'country', 'zipcode', 'department',
                'birthdate', 'sex'
            ]);

            if ($request->hasFile('profile_picture')) {
                $file = $request->file('profile_picture');
                $path = $file->store('profile_pictures', 'public');
                $profileData['profile_picture'] = $path;
                
                $currentProfile = UserProfile::where('user_id', $user->id)->first();
                if ($currentProfile && $currentProfile->profile_picture) {
                    Storage::disk('public')->delete($currentProfile->profile_picture);
                }
            }

            $updatedProfile = UserProfile::updateOrCreate(
                ['user_id' => $user->id],
                $profileData
            );

            DB::commit();

            $pictureUrl = $updatedProfile->profile_picture_url ?? url('storage/' . $updatedProfile->profile_picture);

            return response()->json([
                'message' => 'Profile updated successfully',
                'profile_picture_url' => $pictureUrl
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Admin Profile POST Error: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to update profile', 
                'error' => $e->getMessage()
            ], 500);
        }
    }
}