<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('temporary_course_offerings', function (Blueprint $table) {
            $table->bigIncrements('temporary_course_offering_id');
            $table->unsignedInteger('course_id');
            $table->unsignedInteger('academic_year_id');
            $table->unsignedInteger('semester_id');
            $table->unsignedInteger('program_id');
            $table->integer('year_level');
            $table->unsignedBigInteger('section_per_program_year_id')->nullable();
            $table->boolean('applies_to_all_sections')->default(false);
            $table->enum('type', ['summer', 'bridging', 'tutorial', 'petition']);
            $table->enum('status', ['Pending', 'Approved', 'Rejected'])->default('Approved');

            // ! Postponed Implementation
            // Petition specific fields
            $table->integer('min_petitioners')->default(0);
            $table->integer('petitioners_count')->default(0);
            $table->string('petition_file_path')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->boolean('is_archived')->default(false);
            $table->timestamps();

            $table->foreign('course_id')
                ->references('course_id')
                ->on('courses')
                ->onDelete('cascade');

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

            $table->foreign('section_per_program_year_id')
                ->references('sections_per_program_year_id')
                ->on('sections_per_program_year')
                ->onDelete('set null');

            $table->foreign('created_by')
                ->references('id')
                ->on('users')
                ->onDelete('set null');

            $table->index(['academic_year_id', 'semester_id', 'program_id', 'year_level'], 'temp_offerings_scope_idx');
            $table->index('section_per_program_year_id', 'temp_offerings_section_idx');
            $table->index('is_archived', 'temp_offerings_archived_idx');
            $table->index('type', 'temp_offerings_type_idx');
            $table->index('status', 'temp_offerings_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('temporary_course_offerings');
    }
};
