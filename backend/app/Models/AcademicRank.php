<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AcademicRank extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'is_active'
    ];
    
    // Cast is_active to a boolean automatically
    protected $casts = [
        'is_active' => 'boolean',
    ];
}