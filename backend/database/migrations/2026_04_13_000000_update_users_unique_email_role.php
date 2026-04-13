<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Drop the existing unique index on email (Laravel default name: users_email_unique)
            $table->dropUnique('users_email_unique');
            
            // Add composite unique index on email + role
            $table->unique(['email', 'role'], 'users_email_role_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Drop composite index
            $table->dropUnique('users_email_role_unique');
            
            // Recreate single email unique index (Laravel default name)
            $table->unique('email', 'users_email_unique');
        });
    }
};
