<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class EmailDispatchLog extends Model
{
    use HasFactory;

    protected $table = 'email_dispatch_logs';

    protected $fillable = [
        'faculty_id',
        'recipient_email',
        'recipient_name',
        'purpose',
        'status',
        'error_message',
        'dispatched_at',
        'processed_at',
        'triggered_by',
    ];

    protected $casts = [
        'dispatched_at' => 'datetime',
        'processed_at'  => 'datetime',
    ];

    /**
     * Get the faculty associated with this email dispatch log.
     */
    public function faculty()
    {
        return $this->belongsTo(Faculty::class, 'faculty_id');
    }

    /**
     * Get the admin user who triggered the email dispatch.
     */
    public function triggeredBy()
    {
        return $this->belongsTo(User::class, 'triggered_by');
    }

    /**
     * Scope a query to only include sent logs.
     */
    public function scopeSent($query)
    {
        return $query->where('status', 'sent');
    }

    /**
     * Scope a query to only include queued logs.
     */
    public function scopeQueued($query)
    {
        return $query->where('status', 'queued');
    }

    /**
     * Scope a query to only include failed logs.
     */
    public function scopeFailed($query)
    {
        return $query->where('status', 'failed');
    }

    /**
     * Scope a query to filter by purpose.
     */
    public function scopeForPurpose($query, $purpose)
    {
        return $query->where('purpose', $purpose);
    }
}
