<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Appeal extends Model
{
    use HasFactory;

    // Tell Laravel our primary key is appeal_id, not id
    protected $primaryKey = 'appeal_id'; 

    // Allow these columns to be saved/updated
    protected $fillable = [
        'schedule_id',
        'original_day',
        'original_start_time',
        'original_end_time',
        'original_room_code',
        'day',
        'start_time',
        'end_time',
        'room_id',
        'reasoning',
        'file_path',
        'is_approved',
        'admin_remarks'
    ];

    // Optional: If you want to define relationships later
    public function schedule()
    {
        return $this->belongsTo(Schedule::class, 'schedule_id', 'schedule_id');
    }
}