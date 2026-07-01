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
        'regular_units',
        'additional_units',
    ];

    // Automatically synchronizes FacultyType when DesigneeRole is saved/deleted.
    protected static function booted()
    {
        static::saved(function ($designeeRole) {
            $typeName = "Designee - {$designeeRole->role_name}";

            $facultyType = FacultyType::where(
                'designee_role_id',
                $designeeRole->designee_role_id
            )->first();

            if ($facultyType) {
                $facultyType->update([
                    'faculty_type' => $typeName,
                    'regular_units' => $designeeRole->regular_units,
                    'additional_units' => $designeeRole->additional_units,
                ]);
            } else {
                FacultyType::create([
                    'faculty_type' => $typeName,
                    'regular_units' => $designeeRole->regular_units,
                    'additional_units' => $designeeRole->additional_units,
                    'designee_role_id' => $designeeRole->designee_role_id,
                ]);
            }
        });

        static::deleted(function ($designeeRole) {
            FacultyType::where(
                'designee_role_id',
                $designeeRole->designee_role_id
            )->delete();
        });
    }

    // Returns all faculty types categorized under this designee role.
    public function facultyTypes(): HasMany
    {
        return $this->hasMany(
            FacultyType::class,
            'designee_role_id'
        );
    }
}
