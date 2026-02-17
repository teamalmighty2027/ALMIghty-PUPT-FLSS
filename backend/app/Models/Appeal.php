<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Appeal extends Model
{
    protected $primaryKey = 'appeal_id';

    protected $fillable = [
        'schedule_id',
        // Snapshot of original schedule at submission time (never changes)
        'original_day',
        'original_start_time',
        'original_end_time',
        'original_room_code',
        // Faculty's requested new schedule
        'day',
        'start_time',
        'end_time',
        'room_id',
        'file_path',
        'reasoning',
        'is_approved',
    ];

    public function schedule(): BelongsTo
    {
        return $this->belongsTo(Schedule::class, 'schedule_id', 'schedule_id');
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class, 'room_id', 'room_id');
    }
}