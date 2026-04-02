<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->dropForeignKeyIfExists('preferences', 'course_assignment_id');

        Schema::table('preferences', function (Blueprint $table) {
            $table->unsignedInteger('course_assignment_id')->nullable()->change();
        });

        Schema::table('preferences', function (Blueprint $table) {
            $table->foreign('course_assignment_id')
                ->references('course_assignment_id')
                ->on('course_assignments')
                ->onDelete('cascade');
        });
    }

    public function down(): void
    {
        $this->dropForeignKeyIfExists('preferences', 'course_assignment_id');

        Schema::table('preferences', function (Blueprint $table) {
            $table->unsignedInteger('course_assignment_id')->nullable(false)->change();
        });

        Schema::table('preferences', function (Blueprint $table) {
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
};
