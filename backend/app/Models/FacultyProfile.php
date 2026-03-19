<?php

namespace App\Models;

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
}
