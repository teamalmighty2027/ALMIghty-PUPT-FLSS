<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SectionCourse extends Model
{
    use HasFactory;
    protected $table = 'section_courses';
    protected $primaryKey = 'section_course_id';

    protected $fillable = [
        'sections_per_program_year_id',
        'course_assignment_id',
        'temporary_course_offering_id',
        'is_copy',
    ];

    public function section()
    {
        return $this->belongsTo(SectionsPerProgramYear::class, 'sections_per_program_year_id', 'sections_per_program_year_id');
    }

    public function courseAssignment()
    {
        return $this->belongsTo(CourseAssignment::class, 'course_assignment_id', 'course_assignment_id');
    }

    public function temporaryCourseOffering()
    {
        return $this->belongsTo(TemporaryCourseOffering::class, 'temporary_course_offering_id', 'temporary_course_offering_id');
    }

    public function course()
    {
        return $this->hasOneThrough(
            Course::class,
            CourseAssignment::class,
            'course_assignment_id',
            'course_id',
            'course_assignment_id',
            'course_id'
        );
    }

    public function schedule()
    {
        return $this->hasOne(Schedule::class, 'section_course_id', 'section_course_id');
    }

    public function schedules()
    {
        return $this->hasMany(Schedule::class, 'section_course_id', 'section_course_id');
    }
}
