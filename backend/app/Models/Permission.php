<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Permission extends Model
{
    use HasFactory;

    protected $fillable = [
        'permission_key',
        'display_name',
        'description',
        'category',
    ];

    /**
     * Get the users that have this permission.
     */
    public function adminUsers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'admin_permissions');
    }
}
