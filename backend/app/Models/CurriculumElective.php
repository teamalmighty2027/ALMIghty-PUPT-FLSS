<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CurriculumElective extends Model
{
    use HasFactory;

    protected $primaryKey = 'curriculum_elective_id';

    protected $fillable = [
        'curriculum_id',
        'program_id',
        'year_level',
        'semester_id',
        'elective_slot_name',
        'selected_elective_id',
        'academic_year_id',
    ];

    /**
     * Get the elective variant for this assignment.
     */
    public function elective()
    {
        return $this->belongsTo(
            Elective::class,
            'selected_elective_id',
            'elective_id'
        );
    }

    /**
     * Get the curriculum that owns this assignment.
     */
    public function curriculum()
    {
        return $this->belongsTo(
            Curriculum::class,
            'curriculum_id',
            'curriculum_id'
        );
    }

    /**
     * Get the program that owns this assignment.
     */
    public function program()
    {
        return $this->belongsTo(
            Program::class,
            'program_id',
            'program_id'
        );
    }

    /**
     * Get the semester for this assignment.
     */
    public function semester()
    {
        return $this->belongsTo(
            Semester::class,
            'semester_id',
            'semester_id'
        );
    }

    /**
     * Get the academic year this assignment is scoped to.
     */
    public function academicYear()
    {
        return $this->belongsTo(
            AcademicYear::class,
            'academic_year_id',
            'academic_year_id'
        );
    }
}
