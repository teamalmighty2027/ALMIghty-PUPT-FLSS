<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FacultyTimePlot extends Model
{
    protected $table = 'faculty_time_plots';

    protected $fillable = [
        'faculty_id',
        'active_semester_id',
        'time_type',
        'day',
        'start_time',
        'end_time',
    ];

    /**
     * Relationship to the Faculty model.
     *
     * @return BelongsTo
     */
    public function faculty(): BelongsTo
    {
        return $this->belongsTo(Faculty::class, 'faculty_id', 'id');
    }

    /**
     * Relationship to the ActiveSemester model.
     *
     * @return BelongsTo
     */
    public function activeSemester(): BelongsTo
    {
        return $this->belongsTo(
            ActiveSemester::class,
            'active_semester_id',
            'active_semester_id'
        );
    }
}
