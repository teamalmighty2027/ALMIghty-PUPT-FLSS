<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;

class FacultyProfile extends Model
{
    protected $table = 'faculty_profile';
    protected $primaryKey = 'faculty_profile_id';

    protected $fillable = [
        'faculty_id',
        'profile_picture',
        'house_num',
        'street',
        'barangay',
        'city',
        'province',
        'country',
        'zipcode',
        'department',
        'birthdate',
        'sex',
    ];

    // Automatically append the full image URL when this model is fetched
    protected $appends = ['profile_picture_url'];

    public function faculty()
    {
        return $this->belongsTo(Faculty::class, 'faculty_id', 'id');
    }
    public function getBirthdayAttribute(): ?string
    {
        return $this->formatBirthdate($this->attributes['birthdate'] ?? null);
    }
    /**
     * Get the profile picture URL when available.
     */
    public function getProfilePictureUrlAttribute(): ?string
    {
        if (!empty($this->attributes['profile_picture'])) {
            return asset('storage/' . $this->attributes['profile_picture']);
        }
        return null;
    }

    /**
     * Format a birthdate into Y-m-d or return null for invalid values.
     */
    private function formatBirthdate($birthdate): ?string
    {
        if (empty($birthdate)) return null;
        if ($birthdate instanceof Carbon) return $birthdate->format('Y-m-d');
        try {
            return Carbon::parse($birthdate)->format('Y-m-d');
        } catch (\Throwable $e) {
            return null;
        }
    }
}