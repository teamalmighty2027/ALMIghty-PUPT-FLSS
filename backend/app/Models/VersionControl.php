<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VersionControl extends Model
{
    protected $table = 'version_control';
    
    protected $fillable = [
        'user_id',
        'faculty_name',
        'action_type',
        'table_name',
        'record_id',
        'component',
        'changes_summary',
        'old_data',
        'new_data',
        'ip_address',
        'user_agent',
    ];

    protected $casts = [
        'old_data' => 'array',
        'new_data' => 'array',
        'created_at' => 'datetime',
    ];

    // Disable updated_at since we only have created_at
    const UPDATED_AT = null;

    /**
     * Get the user who made the change
     */
    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}