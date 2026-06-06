<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Elective extends Model
{
    use HasFactory;

    protected $primaryKey = 'elective_id';

    protected $fillable = [
        'elective_slot_name',
        'course_code',
        'course_title',
        'lec_hours',
        'lab_hours',
        'units',
        'tuition_hours',
        'description',
        'is_active',
    ];

    /**
     * Get curriculum elective assignments for this elective.
     */
    public function curriculumElectives()
    {
        return $this->hasMany(
            CurriculumElective::class,
            'selected_elective_id',
            'elective_id'
        );
    }


}
