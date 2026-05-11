<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FacultyProfile extends Model
{
    // Explicitly define the table name since it's singular
    protected $table = 'faculty_profile';
    
    // Explicitly define the primary key
    protected $primaryKey = 'faculty_profile_id';

    protected $fillable = [
        'faculty_id', // Links to the faculties table
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
        'sex'
    ];
}