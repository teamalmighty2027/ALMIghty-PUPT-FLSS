<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FacultyType extends Model
{
    protected $table = 'faculty_type';
    protected $primaryKey = 'faculty_type_id';

    protected $fillable = [
        'faculty_type',
        'regular_units',
        'additional_units',
        'designee_role_id',
    ];

    public function faculty(): HasMany
    {
        return $this->hasMany(Faculty::class, 'faculty_type_id');
    }

    // Returns the designee role that groups this faculty type.
    public function designeeRole(): BelongsTo
    {
        return $this->belongsTo(
            DesigneeRole::class,
            'designee_role_id'
        );
    }

    // Restricts the query to only designee sub-types.
    public function scopeDesignee($query)
    {
        return $query->whereNotNull('designee_role_id');
    }

    public function getTotalUnitsAttribute(): float
    {
        return $this->regular_units + $this->additional_units;
    }
}
