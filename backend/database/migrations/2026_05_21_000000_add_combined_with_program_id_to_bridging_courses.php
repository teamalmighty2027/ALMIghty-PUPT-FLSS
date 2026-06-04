<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Adds a nullable FK column that records which other program this
// bridging course is being taught alongside (combined class).
return new class extends Migration
{
    // Run the migrations to add the combined_with_program_id column.
    public function up(): void
    {
        Schema::table('bridging_courses', function (Blueprint $table) {
            $table->unsignedInteger('combined_with_program_id')
                ->nullable()
                ->after('created_by');

            $table->foreign('combined_with_program_id')
                ->references('program_id')
                ->on('programs')
                ->onDelete('set null');
        });
    }

    // Reverse the migrations by dropping the column and foreign key constraint.
    public function down(): void
    {
        Schema::table('bridging_courses', function (Blueprint $table) {
            $table->dropForeign(['combined_with_program_id']);
            $table->dropColumn('combined_with_program_id');
        });
    }
};
