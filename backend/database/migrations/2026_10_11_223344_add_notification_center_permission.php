<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Inserts view_notification_center permission if it does not yet exist.
     */
    public function up(): void
    {
        $exists = DB::table('permissions')
            ->where('permission_key', 'view_notification_center')
            ->exists();

        if (!$exists) {
            DB::table('permissions')->insert([
                'permission_key' => 'view_notification_center',
                'display_name'   => 'View Notification Center',
                'description'    => 'Access email logs, faculty requests, '
                                  . 'and notification history',
                'category'       => 'administration',
                'created_at'     => now(),
                'updated_at'     => now(),
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('permissions')
            ->where('permission_key', 'view_notification_center')
            ->delete();
    }
};
