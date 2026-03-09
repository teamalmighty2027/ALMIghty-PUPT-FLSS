<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    use HasFactory;

    // Allow mass assignment for these fields
    protected $guarded = [];

    // Tell Laravel we don't use the updated_at column
    public const UPDATED_AT = null;

    // Automatically cast these JSON columns to PHP arrays
    protected $casts = [
        'old_values' => 'array',
        'new_values' => 'array',
        'metadata' => 'array',
    ];

    // Optional: If you want to link it back to the User model
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}