<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DesigneeRole extends Model
{
    protected $table = 'designee_role';
    protected $primaryKey = 'designee_role_id';

    protected $fillable = [
        'role_name',
    ];

    // Returns all faculty types categorized under this designee role.
    public function facultyTypes(): HasMany
    {
        return $this->hasMany(
            FacultyType::class,
            'designee_role_id'
        );
    }
}
