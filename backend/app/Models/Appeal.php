<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Appeal extends Model
{
    protected $primaryKey = 'appeal_id';

    protected $fillable = [
        'schedule_id',
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