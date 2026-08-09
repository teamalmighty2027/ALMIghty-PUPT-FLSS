<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\HasApiTokens;
use App\Models\UserProfile;

class Faculty extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $table = 'faculty';

    protected $fillable = [
        'user_id',
        'faculty_type_id',
        'idp_user_id',
        'is_appeal_enabled',
        'has_appeal_request',
        'has_reactivation_request',
    ];

    protected $with = ['facultyType'];

    public $timestamps = true;

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function facultyType()
    {
        return $this->belongsTo(FacultyType::class, 'faculty_type_id');
    }

    // ==========================================
    // Profile Relationship
    // ==========================================
    public function profile()
    {
        return $this->hasOne(UserProfile::class, 'user_id', 'user_id');
    }

    public function getFacultyUnitsAttribute(): float
    {
        return $this->facultyType ? $this->facultyType->total_units : 0;
    }

    public function setFacultyPasswordAttribute($value)
    {
        $this->attributes['faculty_password'] = Hash::make($value);
    }

    public function schedules()
    {
        return $this->hasMany(Schedule::class, 'faculty_id', 'id');
    }

    public function preferences()
    {
        return $this->hasMany(Preference::class, 'faculty_id');
    }

    public function preferenceSetting()
    {
        return $this->hasOne(PreferencesSetting::class);
    }

    public function schedulePublications()
    {
        return $this->hasMany(FacultySchedulePublication::class, 'faculty_id', 'id');
    }

    public function isSchedulePublished($academicYearId, $semesterId)
    {
        return $this->schedulePublications()
            ->where('academic_year_id', $academicYearId)
            ->where('semester_id', $semesterId)
            ->where('is_published', true)
            ->exists();
    }

    public function timePlots()
    {
        return $this->hasMany(FacultyTimePlot::class, 'faculty_id', 'id');
    }
}