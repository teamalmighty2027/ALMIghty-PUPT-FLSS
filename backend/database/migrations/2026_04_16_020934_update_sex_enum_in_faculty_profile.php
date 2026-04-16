<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Updates the ENUM to accept our new value
        DB::statement("ALTER TABLE faculty_profile MODIFY COLUMN sex ENUM('Male', 'Female', 'Prefer not to say') DEFAULT NULL");
    }

    public function down(): void
    {
        // Reverts back if you ever rollback
        DB::statement("ALTER TABLE faculty_profile MODIFY COLUMN sex ENUM('Male', 'Female') DEFAULT NULL");
    }
};