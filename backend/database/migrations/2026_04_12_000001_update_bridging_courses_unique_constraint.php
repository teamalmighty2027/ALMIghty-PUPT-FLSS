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
        Schema::table('bridging_courses', function (Blueprint $table) {
            // Drop foreign keys that rely on the unique index
            $table->dropForeign(['curriculum_id']);
            $table->dropForeign(['program_id']);
            $table->dropForeign(['year_level_id']);
            $table->dropForeign(['semester_id']);

            // Drop the existing unique constraint
            $table->dropUnique('bridging_courses_scope_unique');

            // Add the new unique constraint including course_id
            $table->unique(
                ['curriculum_id', 'program_id', 'year_level_id', 'semester_id', 'course_id'],
                'bridging_courses_scope_unique'
            );

            // Re-add the foreign keys
            $table->foreign('curriculum_id')
                ->references('curriculum_id')->on('curricula')->onDelete('cascade');

            $table->foreign('program_id')
                ->references('program_id')->on('programs')->onDelete('cascade');

            $table->foreign('year_level_id')
                ->references('year_level_id')->on('year_levels')->onDelete('cascade');

            $table->foreign('semester_id')
                ->references('semester_id')->on('semesters')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bridging_courses', function (Blueprint $table) {
             // Drop foreign keys first
            $table->dropForeign(['curriculum_id']);
            $table->dropForeign(['program_id']);
            $table->dropForeign(['year_level_id']);
            $table->dropForeign(['semester_id']);
            
            // Revert back to the old unique constraint
            $table->dropUnique('bridging_courses_scope_unique');

            $table->unique(
                ['curriculum_id', 'program_id', 'year_level_id', 'semester_id'],
                'bridging_courses_scope_unique'
            );
            
            // Re-add the foreign keys
            $table->foreign('curriculum_id')
                ->references('curriculum_id')->on('curricula')->onDelete('cascade');

            $table->foreign('program_id')
                ->references('program_id')->on('programs')->onDelete('cascade');

            $table->foreign('year_level_id')
                ->references('year_level_id')->on('year_levels')->onDelete('cascade');

            $table->foreign('semester_id')
                ->references('semester_id')->on('semesters')->onDelete('cascade');
        });
    }
};
