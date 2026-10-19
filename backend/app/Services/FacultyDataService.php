<?php

namespace App\Services;

use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Hash;

class FacultyDataService
{
    /**
     * Remove personal identifiable information from user_profile for inactive faculty.
     *
     * @param User $user
     * @return void
     */
    public function scrubInactive(User $user): void
    {
        $profile = UserProfile::where('user_id', $user->id)->first();

        if ($profile) {
            if ($profile->profile_picture) {
                Storage::disk('public')->delete($profile->profile_picture);
            }

            $profile->update([
                'profile_picture' => null,
                'house_num'       => null,
                'street'          => null,
                'barangay'        => null,
                'city'            => null,
                'province'        => null,
                'country'         => null,
                'zipcode'         => null,
                'birthdate'       => null,
                'sex'             => null,
            ]);
        }
    }

    /**
     * Remove all personal identifiable information for retired faculty.
     * Replaces name/email with anonymized placeholders and clears profile.
     *
     * @param User $user
     * @return void
     */
    public function scrubRetired(User $user): void
    {
        $this->scrubInactive($user);

        $placeholderEmail = "retired_{$user->id}@retired.local";
        $randomPassword   = Hash::make(Str::random(40));

        $user->update([
            'first_name'  => 'Retired',
            'middle_name' => null,
            'last_name'   => "Faculty #{$user->id}",
            'suffix_name' => null,
            'email'       => $placeholderEmail,
            'password'    => $randomPassword,
        ]);
    }
}
