<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Permission;
use Illuminate\Database\Seeder;

class AssignExistingAdminPermissionsSeeder extends Seeder
{
    /**
     * Run the database seeds.
     * 
     * This seeder auto-assigns all permissions to existing admins and superadmins.
     * Should be run after PermissionSeeder to ensure permissions exist.
     */
    public function run(): void
    {
        // Get all existing admins (excluding superadmins)
        $admins = User::whereHas('roleModel', function ($q) {
            $q->where('name', 'admin');
        })->get();

        // Get all permission IDs
        $permissionIds = Permission::pluck('id')->toArray();

        // Assign all permissions to each existing admin
        foreach ($admins as $admin) {
            // Only assign if not already assigned to avoid duplicates
            $existingPermissions = $admin->permissions()->pluck('permission_id')->toArray();
            
            $permissionsToAssign = array_diff($permissionIds, $existingPermissions);
            
            if (!empty($permissionsToAssign)) {
                $admin->permissions()->attach($permissionsToAssign);
            }
        }
    }
}
