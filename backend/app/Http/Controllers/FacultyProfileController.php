<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Faculty;
use App\Models\FacultyProfile; 
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;

class FacultyProfileController extends Controller
{
    public function show(Request $request)
    {
        try {
            $user = $request->user();
            
            // 1. Get the faculty record
            $faculty = Faculty::where('user_id', $user->id)->first();
            
            // 2. Safely get the profile using faculty_id
            $profileArray = [];
            if ($faculty) {
                $profile = FacultyProfile::where('faculty_id', $faculty->id)->first();
                
                if ($profile) {
                    $profileArray = $profile->toArray();
                    
                    // FIX: Convert the raw database path into a full, usable web URL
                    if ($profile->profile_picture) {
                        $profileArray['profile_picture_url'] = url('storage/' . $profile->profile_picture);
                    }
                }
            }

            // Safely merge data
            $responseData = array_merge(
                $user ? $user->toArray() : [],
                $faculty ? $faculty->toArray() : [],
                $profileArray
            );

            return response()->json($responseData);
            
        } catch (\Exception $e) {
            Log::error('Profile GET Error: ' . $e->getMessage());
            return response()->json(['error' => 'Internal Server Error', 'details' => $e->getMessage()], 500);
        }
    }

    public function update(Request $request)
    {
        $user = $request->user();

        DB::beginTransaction();

        try {
            // Get the faculty record
            $faculty = Faculty::where('user_id', $user->id)->firstOrFail();

            // Update the name fields on the Faculty model
            $faculty->update($request->only(['first_name', 'last_name', 'middle_name', 'suffix_name']));
            
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
                $path = $file->store('profile_pictures', 'public');
                $profileData['profile_picture'] = $path;
                
                // Delete old picture if it exists, checking by faculty_id
                $currentProfile = FacultyProfile::where('faculty_id', $faculty->id)->first();
                if ($currentProfile && $currentProfile->profile_picture) {
                    Storage::disk('public')->delete($currentProfile->profile_picture);
                }
            }

            // Create or update the profile matching the faculty_id
            $updatedProfile = FacultyProfile::updateOrCreate(
                ['faculty_id' => $faculty->id],
                $profileData
            );

            DB::commit();

            // Fallback added in case your model lacks a profile_picture_url accessor
            $pictureUrl = $updatedProfile->profile_picture_url ?? url('storage/' . $updatedProfile->profile_picture);

            return response()->json([
                'message' => 'Profile updated successfully',
                'profile_picture_url' => $pictureUrl
            ]);
            
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Profile POST Error: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to update profile', 'error' => $e->getMessage()], 500);
        }
    }
}