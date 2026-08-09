<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

// Represents a system-level notice (frontend errors, backend exceptions,
// security events, reactivation requests) visible to the Super Admin.
class SystemNotice extends Model
{
    use HasFactory;

    // Allow mass assignment for all fields
    protected $guarded = [];

    // Automatically cast JSON context column to PHP array
    protected $casts = [
        'context'     => 'array',
        'resolved_at' => 'datetime',
    ];

    // ── Relationships ────────────────────────────────────────────────

    /**
     * The user who triggered the event (null for system-level notices).
     */
    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * The superadmin who resolved the notice.
     */
    public function resolvedBy()
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    // ── Query Scopes ─────────────────────────────────────────────────

    /**
     * Filter to only unresolved notices.
     */
    public function scopeUnresolved($query)
    {
        return $query->whereNull('resolved_at');
    }

    /**
     * Filter by severity level.
     */
    public function scopeBySeverity($query, string $severity)
    {
        return $query->where('severity', $severity);
    }

    /**
     * Filter by notice type.
     */
    public function scopeByType($query, string $type)
    {
        return $query->where('type', $type);
    }

    /**
     * Filter to only actionable (error/critical) notices.
     */
    public function scopeActionable($query)
    {
        return $query->whereIn('severity', ['error', 'critical']);
    }
}
