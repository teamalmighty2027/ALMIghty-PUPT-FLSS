<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class InternalArrangement extends Model
{
    use HasFactory;

    protected $primaryKey = 'arrangement_id';

    protected $fillable = [
        'schedule_id',
        'appeal_id',
        'day',
        'start_time',
        'end_time',
        'room_id'
    ];
}