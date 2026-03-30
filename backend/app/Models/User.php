<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\HasApiTokens;
use App\Traits\Auditable;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;
    
    protected $fillable = [
        'first_name',
        'middle_name',
        'last_name',
        'suffix_name',
        'code',
        'email',
        'password',
        'role',
        'status',
    ];

    protected $hidden = [
        'password',
    ];

    /**
     * Cached permissions to avoid N+1 queries.
     * @var \Illuminate\Database\Eloquent\Collection|null
     */
    protected $_cachedPermissions = null;

    /**
     * Cached program IDs to avoid N+1 queries.
     * @var array|null
     */
    protected $_cachedProgramIds = null;

    /**
     * Default accessor to get the full name.
     */
    public function getNameAttribute()
    {
        $fullName = $this->first_name;
        if ($this->middle_name) {
            $fullName .= ' ' . $this->middle_name;
        }
        $fullName .= ' ' . $this->last_name;
        if ($this->suffix_name) {
            $fullName .= ' ' . $this->suffix_name;
        }
        return $fullName;
    }

    /**
     * Accessor to get the formatted name
     * Format: last_name, first_name middle_name suffix_name
     */
    public function getFormattedNameAttribute()
    {
        $formattedName = $this->last_name;
        $formattedName .= ', ' . $this->first_name;

        if ($this->middle_name) {
            $formattedName .= ' ' . $this->middle_name;
        }

        if ($this->suffix_name) {
            $formattedName .= ' ' . $this->suffix_name;
        }

        return $formattedName;
    }

    public function setPasswordAttribute($value)
    {
        $this->attributes['password'] = Hash::needsRehash($value) 
          ? Hash::make($value) : $value;
    }

    public function faculty()
    {
        return $this->hasOne(Faculty::class, 'user_id');
    }
        public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function facultyProfile()
    {
        return $this->hasOneThrough(
            FacultyProfile::class,
            Faculty::class,
            'user_id',
            'faculty_id',
            'id',
            'id'
        );
    }

    /**
     * Get the permissions for this user (admin only).
     */
    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'admin_permissions');
    }

    /**
     * Get the allowed programs for this user (admin only).
     * If no programs are assigned, all programs are allowed.
     * 
     * Note: Program model uses 'program_id' as primary key, not 'id'
     */
    public function allowedPrograms(): BelongsToMany
    {
        return $this->belongsToMany(
            Program::class,
            'admin_programs',
            'user_id',
            'program_id',
            'id',
            'program_id'
        );
    }

    /**
     * Check if user has a specific permission by permission key.
     * Uses cached permissions to avoid N+1 queries.
     * 
     * @param string $permissionKey
     * @return bool
     */
    public function hasPermission(string $permissionKey): bool
    {
        if ($this->role === 'superadmin') {
            return true;
        }

        // Load and cache permissions on first call
        if ($this->_cachedPermissions === null) {
            // Check if relation is already loaded (via eager loading)
            if ($this->relationLoaded('permissions')) {
                $this->_cachedPermissions = $this->getRelationValue('permissions');
            } else {
                // Load permissions from database
                $this->_cachedPermissions = $this->permissions()->get();
            }
        }

        // Check cached permissions for the key
        return $this->_cachedPermissions->contains('permission_key', $permissionKey);
    }

    /**
     * Check if user has full access (no program restrictions).
     * Returns true if user has no program restrictions assigned.
     * Uses cached programs to avoid N+1 queries.
     * 
     * @return bool
     */
    public function isFullAccess(): bool
    {
        if ($this->role === 'superadmin') {
            return true;
        }

        // Check if relation is already loaded (via eager loading)
        if ($this->relationLoaded('allowedPrograms')) {
            return $this->getRelationValue('allowedPrograms')->isEmpty();
        }

        // Otherwise, check with a count query
        return $this->allowedPrograms()->doesntExist();
    }

    /**
     * Get the allowed program IDs for this user.
     * Returns empty array if user has full access to all programs.
     * Uses cached programs to avoid N+1 queries.
     * 
     * @return array
     */
    public function getAllowedProgramIds(): array
    {
        if ($this->isFullAccess()) {
            return [];
        }

        // Return cached program IDs if available
        if ($this->_cachedProgramIds !== null) {
            return $this->_cachedProgramIds;
        }

        // Check if relation is already loaded (via eager loading)
        if ($this->relationLoaded('allowedPrograms')) {
            $this->_cachedProgramIds = $this->getRelationValue('allowedPrograms')
                ->pluck('program_id')
                ->toArray();
        } else {
            // Load program IDs from database
            $this->_cachedProgramIds = $this->allowedPrograms()
                ->pluck('program_id')
                ->toArray();
        }

        return $this->_cachedProgramIds;
    }

    /**
     * Load permissions and programs eagerly to avoid N+1 queries.
     * Call this in controllers when you need to check multiple permissions/programs.
     * Example: $admin = User::with('permissions', 'allowedPrograms')->find($id);
     * 
     * @return void
     */
    public function loadPermissionsAndPrograms(): void
    {
        if (!$this->relationLoaded('permissions')) {
            $this->load('permissions');
        }
        if (!$this->relationLoaded('allowedPrograms')) {
            $this->load('allowedPrograms');
        }
    }
}