<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TemporaryCourseOffering extends Model
{
    use HasFactory;

    protected $table = 'temporary_course_offerings';
    protected $primaryKey = 'temporary_course_offering_id';

    protected $fillable = [
        'course_id',
        'academic_year_id',
        'semester_id',
        'program_id',
        'year_level',
        'section_per_program_year_id',
        'applies_to_all_sections',
        'type',
        'status',
        'min_petitioners',
        'petitioners_count',
        'petition_file_path',
        'created_by',
        'is_archived',
    ];

    protected $casts = [
        'applies_to_all_sections' => 'boolean',
        'is_archived' => 'boolean',
    ];

    public function course()
    {
        return $this->belongsTo(Course::class, 'course_id', 'course_id');
    }

    public function academicYear()
    {
        return $this->belongsTo(AcademicYear::class, 'academic_year_id', 'academic_year_id');
    }

    public function semester()
    {
        return $this->belongsTo(Semester::class, 'semester_id', 'semester_id');
    }

    public function program()
    {
        return $this->belongsTo(Program::class, 'program_id', 'program_id');
    }

    public function section()
    {
        return $this->belongsTo(SectionsPerProgramYear::class, 'section_per_program_year_id', 'sections_per_program_year_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by', 'id');
    }

    public function sectionCourses()
    {
        return $this->hasMany(SectionCourse::class, 'temporary_course_offering_id', 'temporary_course_offering_id');
    }

    public function preferences()
    {
        return $this->hasMany(Preference::class, 'temporary_course_offering_id', 'temporary_course_offering_id');
    }
}
