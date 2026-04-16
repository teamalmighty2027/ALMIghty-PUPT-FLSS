<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Faculty;
use App\Models\FacultyProfile;
use Illuminate\Support\Facades\DB;

class FacultyProfileController extends Controller
{
    public function show(Request $request)
    {
        $user = $request->user();
        
        // Find the Faculty record based on the logged-in User
        $faculty = Faculty::with('profile')->where('user_id', $user->id)->firstOrFail();

        // Merge User details, Faculty details, and Profile details so the frontend gets everything
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
            // 1. Update the Names on the USER table
            $user->update($request->only(['first_name', 'last_name', 'middle_name', 'suffix_name']));

            // 2. Find the correct FACULTY record
            $faculty = Faculty::where('user_id', $user->id)->firstOrFail();

            // 3. Update the FACULTY table (if the code is edited)
            if ($request->has('code')) {
                // Remove this line if 'code' is actually stored in the User table instead of Faculty
                $faculty->update(['code' => $request->code]); 
            }

            // 4. Update or Create the PROFILE table using the correct FACULTY ID
            FacultyProfile::updateOrCreate(
                ['faculty_id' => $faculty->id], // CRITICAL FIX: Using faculty->id, not user->id
                $request->only([
                    'house_num', 'street', 'barangay', 'city', 
                    'province', 'country', 'zipcode', 'program_id', 
                    'birthdate', 'sex'
                ])
            );

            DB::commit();

            return response()->json(['message' => 'Profile updated successfully']);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to update profile', 'error' => $e->getMessage()], 500);
        }
    }
}