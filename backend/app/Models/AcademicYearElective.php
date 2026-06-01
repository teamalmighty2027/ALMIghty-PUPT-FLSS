<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AcademicYearElective extends Model
{
    use HasFactory;

    protected $primaryKey = 'academic_year_elective_id';

    protected $fillable = [
        'academic_year_id',
        'semester_id',
        'program_id',
        'year_level',
        'elective_slot_name',
        'selected_elective_id',
    ];

    /**
     * Get the elective variant for this override.
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
     * Get the academic year that owns this override.
     */
    public function academicYear()
    {
        return $this->belongsTo(
            AcademicYear::class,
            'academic_year_id',
            'academic_year_id'
        );
    }

    /**
     * Get the program that owns this override.
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
     * Get the semester for this override.
     */
    public function semester()
    {
        return $this->belongsTo(
            Semester::class,
            'semester_id',
            'semester_id'
        );
    }
}
