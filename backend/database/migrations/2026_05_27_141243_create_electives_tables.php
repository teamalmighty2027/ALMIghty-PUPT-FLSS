<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Temporarily disable MySQL's strict relationship checking
        Schema::disableForeignKeyConstraints();

        // 2. Drop EVERYTHING that might be connected
        Schema::dropIfExists('academic_year_electives');
        Schema::dropIfExists('curriculum_electives');
        Schema::dropIfExists('electives');

        // 3. Rebuild the Elective Pool
        Schema::create('electives', function (Blueprint $table) {
            $table->id('elective_id'); // This creates an Unsigned Big Integer
            $table->string('elective_slot_name');
            $table->string('course_code');
            $table->string('course_title');
            $table->integer('lec_hours')->default(0);
            $table->integer('lab_hours')->default(0);
            $table->integer('units')->default(0);
            $table->integer('tuition_hours')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // 4. Rebuild the Curriculum Assignments
        Schema::create('curriculum_electives', function (Blueprint $table) {
            $table->id('curriculum_elective_id');

            // FIX: Changed to unsignedInteger to match your older tables
            $table->unsignedInteger('curriculum_id');
            $table->unsignedInteger('program_id');
            $table->integer('year_level');
            $table->unsignedInteger('semester_id');
            $table->string('elective_slot_name');
            
            // This stays BigInteger because it connects to the new electives table above
            $table->unsignedBigInteger('selected_elective_id');
            $table->timestamps();

            // Foreign keys
            $table->foreign('curriculum_id')->references('curriculum_id')->on('curricula')->onDelete('cascade');
            $table->foreign('program_id')->references('program_id')->on('programs')->onDelete('cascade');
            $table->foreign('semester_id')->references('semester_id')->on('semesters')->onDelete('cascade');
            $table->foreign('selected_elective_id')->references('elective_id')->on('electives')->onDelete('cascade');

            $table->unique(['curriculum_id', 'program_id', 'year_level', 'semester_id', 'elective_slot_name'], 'unique_curriculum_elective');
        });

        // 5. Turn constraints back on
        Schema::enableForeignKeyConstraints();
    }

    public function down(): void
    {
        Schema::dropIfExists('curriculum_electives');
        Schema::dropIfExists('electives');
    }
};