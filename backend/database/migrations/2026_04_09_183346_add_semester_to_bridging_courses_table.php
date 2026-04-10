<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Drop FKs that rely on the unique index
        Schema::table('bridging_courses', function (Blueprint $table) {
            $table->dropForeign(['curriculum_id']);
            $table->dropForeign(['program_id']);
        });

        // Now drop the unique index safely
        Schema::table('bridging_courses', function (Blueprint $table) {
            $table->dropUnique('bridging_courses_scope_unique');
        });

        // Remove old numeric year_level if present
        if (Schema::hasColumn('bridging_courses', 'year_level')) {
            Schema::table('bridging_courses', function (Blueprint $table) {
                $table->dropColumn('year_level');
            });
        }

        // Add new FK columns if missing
        Schema::table('bridging_courses', function (Blueprint $table) {
            if (!Schema::hasColumn('bridging_courses', 'year_level_id')) {
                $table->unsignedInteger('year_level_id')->nullable()->after('program_id');
            }
            if (!Schema::hasColumn('bridging_courses', 'semester_id')) {
                $table->unsignedInteger('semester_id')->nullable()->after('year_level_id');
            }

            // Re-add FKs
            $table->foreign('curriculum_id')
                ->references('curriculum_id')->on('curricula')->onDelete('cascade');

            $table->foreign('program_id')
                ->references('program_id')->on('programs')->onDelete('cascade');

            $table->foreign('year_level_id')
                ->references('year_level_id')->on('year_levels')->onDelete('cascade');

            $table->foreign('semester_id')
                ->references('semester_id')->on('semesters')->onDelete('cascade');

            // New unique scope
            $table->unique(
                ['curriculum_id', 'program_id', 'year_level_id', 'semester_id'],
                'bridging_courses_scope_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::table('bridging_courses', function (Blueprint $table) {
            $table->dropForeign(['semester_id']);
            $table->dropForeign(['year_level_id']);
            $table->dropColumn('semester_id');
            $table->dropColumn('year_level_id');
        });
    }
};