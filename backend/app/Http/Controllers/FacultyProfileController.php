<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Faculty;
use App\Models\UserProfile; 
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
            
            // Fetch profile using user_id instead of faculty_id
            $profile = UserProfile::where('user_id', $user->id)->first();
            
            $profileArray = [];
            if ($profile) {
                $profileArray = $profile->toArray();
                
                // Convert raw database path into a full web URL
                if ($profile->profile_picture) {
                    $profileArray['profile_picture_url'] = url('backend/public/storage/' . $profile->profile_picture);
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

        // 1. STRICT VALIDATION: This acts as our shield. 
        // If anything fails here, Laravel automatically throws a 422 error.
        $validated = $request->validate([
            'first_name'      => 'nullable|string|max:255',
            'last_name'       => 'nullable|string|max:255',
            'middle_name'     => 'nullable|string|max:255',
            'suffix_name'     => 'nullable|string|max:50',
            'code'            => 'nullable|string|max:100',
            'house_num'       => 'nullable|string|max:255',
            'street'          => 'nullable|string|max:255',
            'barangay'        => 'nullable|string|max:255',
            'city'            => 'nullable|string|max:255',
            'province'        => 'nullable|string|max:255',
            'country'         => 'nullable|string|max:255',
            'zipcode'         => 'nullable|string|max:20',
            'department'      => 'nullable|string|max:255',
            'birthdate'       => 'nullable|date',
            'sex'             => 'nullable|string|in:Male,Female', // Adjust if you have more options
            'academic_rank'   => 'nullable|string|max:255',
            'profile_picture' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120', // Max 5MB image
        ]);

        DB::beginTransaction();

        try {
            // 2. Use ONLY the $validated data, never raw $request data
            $userData = array_intersect_key($validated, array_flip(['first_name', 'last_name', 'middle_name', 'suffix_name', 'code']));
            $user->update($userData);

            $profileData = array_intersect_key($validated, array_flip([
                'house_num', 'street', 'barangay', 'city', 
                'province', 'country', 'zipcode', 'department',
                'birthdate', 'sex', 'academic_rank'
            ]));

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

            $pictureUrl = url('backend/public/storage/' . $updatedProfile->profile_picture);

            return response()->json([
                'message' => 'Profile updated successfully',
                'profile_picture_url' => $pictureUrl
            ]);
            
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Profile POST Error: ' . $e->getMessage());
            // Because of our Phase 2 Handler.php fix, this will now safely return a 500 
            // without leaking system details in production.
            return response()->json(['message' => 'Failed to update profile. Please try again later.'], 500);
        }
    }
}