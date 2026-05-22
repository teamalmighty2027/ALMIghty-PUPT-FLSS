<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Create the academic year electives table.
     */
    public function up(): void
    {
        Schema::create('academic_year_electives', function (Blueprint $table) {
            $table->increments('academic_year_elective_id');
            $table->unsignedInteger('academic_year_id');
            $table->unsignedInteger('semester_id');
            $table->unsignedInteger('program_id');
            $table->integer('year_level');
            $table->string('elective_slot_name', 50);
            $table->unsignedInteger('selected_elective_id');
            $table->timestamps();

            $table->foreign('academic_year_id')
                ->references('academic_year_id')
                ->on('academic_years')
                ->onDelete('cascade');

            $table->foreign('semester_id')
                ->references('semester_id')
                ->on('semesters')
                ->onDelete('cascade');

            $table->foreign('program_id')
                ->references('program_id')
                ->on('programs')
                ->onDelete('cascade');

            $table->foreign('selected_elective_id')
                ->references('elective_id')
                ->on('electives')
                ->onDelete('restrict');

            $table->index('academic_year_id');
            $table->index('semester_id');
            $table->index('program_id');
            $table->index('year_level');
            $table->index('elective_slot_name');
            $table->index('selected_elective_id');

            $table->unique(
                [
                    'academic_year_id',
                    'semester_id',
                    'program_id',
                    'year_level',
                    'elective_slot_name',
                ],
                'academic_year_elective_unique'
            );
        });
    }

    /**
     * Drop the academic year electives table.
     */
    public function down(): void
    {
        Schema::dropIfExists('academic_year_electives');
    }
};
