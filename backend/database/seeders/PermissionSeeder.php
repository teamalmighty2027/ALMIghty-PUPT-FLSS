<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $permissions = [
            [
                'permission_key' => 'view_reports',
                'display_name' => 'View Reports',
                'description' => 'View official reports page',
                'category' => 'reporting',
            ],
            [
                'permission_key' => 'edit_academic_years',
                'display_name' => 'Edit Academic Years',
                'description' => 'Create/edit academic years and semesters',
                'category' => 'administration',
            ],
            [
                'permission_key' => 'edit_faculty_preferences',
                'display_name' => 'Edit Faculty Preferences',
                'description' => 'Activate and manage faculty preferences',
                'category' => 'preferences',
            ],
            [
                'permission_key' => 'assign_schedules',
                'display_name' => 'Assign Schedules',
                'description' => 'Modify course schedules and faculty assignments',
                'category' => 'scheduling',
            ],
            [
                'permission_key' => 'view_preferences',
                'display_name' => 'View Preferences',
                'description' => 'View faculty preferences (read-only)',
                'category' => 'preferences',
            ],
        ];

        foreach ($permissions as $permission) {
            Permission::firstOrCreate(
                ['permission_key' => $permission['permission_key']],
                $permission
            );
        }
    }
}
