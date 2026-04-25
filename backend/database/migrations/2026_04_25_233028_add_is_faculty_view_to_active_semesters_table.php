<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('active_semesters', function (Blueprint $table) {
            // Tracks which semester faculty can currently see their schedules for.
            // Defaults to match is_active for all existing rows.
            $table->boolean('is_faculty_view')
                  ->default(0)
                  ->after('is_active');
        });

        // Seed existing rows: faculty_view = is_active
        DB::table('active_semesters')->update([
            'is_faculty_view' => DB::raw('is_active'),
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('active_semesters', function (Blueprint $table) {
            $table->dropColumn('is_faculty_view');
        });
    }
};
