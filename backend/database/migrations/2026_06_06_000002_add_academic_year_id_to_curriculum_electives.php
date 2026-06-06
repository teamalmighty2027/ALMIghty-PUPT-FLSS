<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Add academic_year_id to curriculum_electives to scope
     * the active elective per academic year.
     */
    public function up(): void
    {
        if (!Schema::hasColumn('curriculum_electives', 'academic_year_id')) {
            Schema::table('curriculum_electives', function (Blueprint $table) {
                // Add nullable FK column (nullable = backward compat)
                $table->unsignedInteger('academic_year_id')
                    ->nullable()
                    ->after('elective_slot_name');

                $table->foreign('academic_year_id')
                    ->references('academic_year_id')
                    ->on('academic_years')
                    ->onDelete('cascade');

                $table->index('academic_year_id');
            });
        }

        // Check existing indexes dynamically
        $existingIndexes = DB::select(
            "SELECT DISTINCT INDEX_NAME 
             FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'curriculum_electives'"
        );
        $indexNames = array_column($existingIndexes, 'INDEX_NAME');

        Schema::table('curriculum_electives', function (Blueprint $table) use ($indexNames) {
            if (!in_array('curriculum_electives_curriculum_id_index', $indexNames) &&
                !in_array('curriculum_id', $indexNames)) {
                $table->index('curriculum_id');
            }
            if (!in_array('curriculum_electives_program_id_index', $indexNames) &&
                !in_array('program_id', $indexNames)) {
                $table->index('program_id');
            }
            if (!in_array('curriculum_electives_semester_id_index', $indexNames) &&
                !in_array('semester_id', $indexNames)) {
                $table->index('semester_id');
            }
        });

        // Find the old unique index name dynamically
        $index = DB::selectOne(
            "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'curriculum_electives'
               AND INDEX_NAME IN ('unique_curriculum_elective', 
                                  'curriculum_elective_unique')"
        );

        Schema::table(
            'curriculum_electives', 
            function (Blueprint $table) use ($index) {
                if ($index) {
                    $table->dropUnique($index->INDEX_NAME);
                }

                // Add new 6-column unique constraint including AY
                $table->unique(
                    [
                        'curriculum_id',
                        'program_id',
                        'year_level',
                        'semester_id',
                        'elective_slot_name',
                        'academic_year_id',
                    ],
                    'curriculum_elective_unique'
                );
            }
        );
    }

    /**
     * Reverse: remove academic_year_id column and restore the
     * original 5-column unique constraint.
     */
    public function down(): void
    {
        Schema::table('curriculum_electives', function (Blueprint $table) {
            $table->dropUnique('curriculum_elective_unique');
            $table->dropForeign(['academic_year_id']);
            $table->dropIndex(['academic_year_id']);
            $table->dropColumn('academic_year_id');

            $table->unique(
                [
                    'curriculum_id',
                    'program_id',
                    'year_level',
                    'semester_id',
                    'elective_slot_name',
                ],
                'unique_curriculum_elective'
            );
        });
    }
};
