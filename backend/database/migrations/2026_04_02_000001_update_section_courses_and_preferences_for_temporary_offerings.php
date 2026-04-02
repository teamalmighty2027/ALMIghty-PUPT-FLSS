<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('section_courses', function (Blueprint $table) {
            $table->unsignedBigInteger('temporary_course_offering_id')
                ->nullable()
                ->after('course_assignment_id');
        });

        $this->dropForeignKeyIfExists('section_courses', 'course_assignment_id');

        Schema::table('section_courses', function (Blueprint $table) {
            $table->unsignedInteger('course_assignment_id')->nullable()->change();
        });

        DB::statement(
            'UPDATE section_courses sc '
            . 'LEFT JOIN course_assignments ca '
            . 'ON sc.course_assignment_id = ca.course_assignment_id '
            . 'SET sc.course_assignment_id = NULL '
            . 'WHERE sc.course_assignment_id IS NOT NULL '
            . 'AND ca.course_assignment_id IS NULL'
        );

        Schema::table('section_courses', function (Blueprint $table) {
            $table->foreign('course_assignment_id')
                ->references('course_assignment_id')
                ->on('course_assignments')
                ->onDelete('cascade');

            $table->foreign('temporary_course_offering_id')
                ->references('temporary_course_offering_id')
                ->on('temporary_course_offerings')
                ->onDelete('cascade');

            $table->index('temporary_course_offering_id', 'section_courses_temp_offering_idx');
            $table->index(
                ['sections_per_program_year_id', 'temporary_course_offering_id', 'is_copy'],
                'section_courses_temp_lookup_idx'
            );
        });

        Schema::table('preferences', function (Blueprint $table) {
            $table->unsignedBigInteger('temporary_course_offering_id')
                ->nullable()
                ->after('course_assignment_id');
        });

        $this->dropIndexIfExists('preferences', 'unique_preference', true);

        Schema::table('preferences', function (Blueprint $table) {
            $table->foreign('temporary_course_offering_id')
                ->references('temporary_course_offering_id')
                ->on('temporary_course_offerings')
                ->onDelete('cascade');

            $table->index('temporary_course_offering_id', 'preferences_temp_offering_idx');

            $table->unique(
                ['faculty_id', 'active_semester_id', 'course_assignment_id', 'sections_per_program_year_id'],
                'unique_preference_course'
            );

            $table->unique(
                ['faculty_id', 'active_semester_id', 'temporary_course_offering_id', 'sections_per_program_year_id'],
                'unique_preference_temp'
            );
        });
    }

    public function down(): void
    {
        $this->dropIndexIfExists('preferences', 'unique_preference_course', true);
        $this->dropIndexIfExists('preferences', 'unique_preference_temp', true);
        $this->dropForeignKeyIfExists('preferences', 'temporary_course_offering_id');
        $this->dropIndexIfExists('preferences', 'preferences_temp_offering_idx');

        Schema::table('preferences', function (Blueprint $table) {
            $table->dropColumn('temporary_course_offering_id');

            $table->unique(
                ['faculty_id', 'active_semester_id', 'course_assignment_id', 'sections_per_program_year_id'],
                'unique_preference'
            );
        });

        $this->dropIndexIfExists('section_courses', 'section_courses_temp_lookup_idx');
        $this->dropIndexIfExists('section_courses', 'section_courses_temp_offering_idx');
        $this->dropForeignKeyIfExists('section_courses', 'temporary_course_offering_id');

        Schema::table('section_courses', function (Blueprint $table) {
            $table->dropColumn('temporary_course_offering_id');
        });

        $this->dropForeignKeyIfExists('section_courses', 'course_assignment_id');

        Schema::table('section_courses', function (Blueprint $table) {
            $table->unsignedInteger('course_assignment_id')->nullable(false)->change();
            $table->foreign('course_assignment_id')
                ->references('course_assignment_id')
                ->on('course_assignments')
                ->onDelete('cascade');
        });
    }

    private function dropForeignKeyIfExists(string $table, string $column): void
    {
        $constraint = DB::selectOne(
            'SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE '
            . 'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? '
            . 'AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1',
            [$table, $column]
        );

        if (!$constraint || !isset($constraint->CONSTRAINT_NAME)) {
            return;
        }

        $constraintName = $constraint->CONSTRAINT_NAME;

        Schema::table($table, function (Blueprint $table) use ($constraintName) {
            $table->dropForeign($constraintName);
        });
    }

    private function dropIndexIfExists(string $table, string $indexName, bool $isUnique = false): void
    {
        $index = DB::selectOne('SHOW INDEX FROM `' . $table . '` WHERE Key_name = ?', [$indexName]);

        if (!$index) {
            return;
        }

        Schema::table($table, function (Blueprint $table) use ($indexName, $isUnique) {
            if ($isUnique) {
                $table->dropUnique($indexName);
                return;
            }

            $table->dropIndex($indexName);
        });
    }
};
