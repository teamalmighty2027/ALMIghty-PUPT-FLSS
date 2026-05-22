<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Create the curriculum electives table.
     */
    public function up(): void
    {
        Schema::create('curriculum_electives', function (Blueprint $table) {
            $table->increments('curriculum_elective_id');
            $table->unsignedInteger('curriculum_id');
            $table->unsignedInteger('program_id');
            $table->integer('year_level');
            $table->unsignedInteger('semester_id');
            $table->string('elective_slot_name', 50);
            $table->unsignedInteger('selected_elective_id');
            $table->timestamps();

            $table->foreign('curriculum_id')
                ->references('curriculum_id')
                ->on('curricula')
                ->onDelete('cascade');

            $table->foreign('program_id')
                ->references('program_id')
                ->on('programs')
                ->onDelete('cascade');

            $table->foreign('semester_id')
                ->references('semester_id')
                ->on('semesters')
                ->onDelete('cascade');

            $table->foreign('selected_elective_id')
                ->references('elective_id')
                ->on('electives')
                ->onDelete('restrict');

            $table->index('curriculum_id');
            $table->index('program_id');
            $table->index('semester_id');
            $table->index('year_level');
            $table->index('elective_slot_name');
            $table->index('selected_elective_id');

            $table->unique(
                [
                    'curriculum_id',
                    'program_id',
                    'year_level',
                    'semester_id',
                    'elective_slot_name',
                ],
                'curriculum_elective_unique'
            );
        });
    }

    /**
     * Drop the curriculum electives table.
     */
    public function down(): void
    {
        Schema::dropIfExists('curriculum_electives');
    }
};
