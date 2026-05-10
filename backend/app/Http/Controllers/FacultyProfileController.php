<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Faculty;
use App\Models\UserProfile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class FacultyProfileController extends Controller
{
    public function show(Request $request)
    {
        $user = $request->user();
        $faculty = Faculty::with('profile')->where('user_id', $user->id)->firstOrFail();

        $responseData = array_merge(
            $user->toArray(),
            $faculty->toArray(),
            $faculty->profile ? $faculty->profile->toArray() : []
        );

        return response()->json($responseData);
    }

    public function update(Request $request)
    {
        $user = $request->user();

        DB::beginTransaction();

        try {
            $user->update($request->only(['first_name', 'last_name', 'middle_name', 'suffix_name']));
            $faculty = Faculty::where('user_id', $user->id)->firstOrFail();

            if ($request->has('code')) {
                $faculty->update(['code' => $request->code]); 
            }

            // Prepare profile data
            $profileData = $request->only([
                'house_num', 'street', 'barangay', 'city', 
                'province', 'country', 'zipcode', 'department',
                'birthdate', 'sex'
            ]);

            // Handle Profile Picture Upload
            if ($request->hasFile('profile_picture')) {
                $file = $request->file('profile_picture');
                // Saves to storage/app/public/profile_pictures
                $path = $file->store('profile_pictures', 'public');
                $profileData['profile_picture'] = $path;
                
                // Delete old picture if it exists
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

            return response()->json([
                'message' => 'Profile updated successfully',
                'profile_picture_url' => $updatedProfile->profile_picture_url
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to update profile', 'error' => $e->getMessage()], 500);
        }
    }
}