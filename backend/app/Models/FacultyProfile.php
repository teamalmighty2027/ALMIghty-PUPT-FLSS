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
        'house_num',
        'street',
        'barangay',
        'city',
        'province',
        'country',
        'zipcode',
        'program_id',
        'birthdate',
        'sex',
    ];

    /**
     * Get the faculty associated with this profile.
     */
    public function faculty()
    {
        return $this->belongsTo(Faculty::class, 'faculty_id', 'id');
    }

    /**
     * Get the program associated with this profile.
     */
    public function program()
    {
        return $this->belongsTo(Program::class, 'program_id', 'program_id');
    }

    /**
     * Format birthdate with robust null/type checking.
     * Accessible as $model->birthday throughout the application.
     */
    public function getBirthdayAttribute(): ?string
    {
        return $this->formatBirthdate($this->attributes['birthdate'] ?? null);
    }

    /**
     * Helper method to format birthdate.
     * Handles Carbon instances, strings, and null values gracefully.
     */
    private function formatBirthdate($birthdate): ?string
    {
        if (empty($birthdate)) {
            return null;
        }

        if ($birthdate instanceof Carbon) {
            return $birthdate->format('Y-m-d');
        }

        try {
            return Carbon::parse($birthdate)->format('Y-m-d');
        } catch (\Throwable $e) {
            return null;
        }
    }
}
