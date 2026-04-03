<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bridging_courses', function (Blueprint $table) {
            $table->bigIncrements('bridging_course_id');
            $table->unsignedInteger('curriculum_id');
            $table->unsignedInteger('program_id');
            $table->integer('year_level');
            $table->unsignedInteger('course_id');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->unique(
                ['curriculum_id', 'program_id', 'year_level'],
                'bridging_courses_scope_unique'
            );

            $table->foreign('curriculum_id')
                ->references('curriculum_id')
                ->on('curricula')
                ->onDelete('cascade');

            $table->foreign('program_id')
                ->references('program_id')
                ->on('programs')
                ->onDelete('cascade');

            $table->foreign('course_id')
                ->references('course_id')
                ->on('courses')
                ->onDelete('cascade');

            $table->foreign('created_by')
                ->references('id')
                ->on('users')
                ->onDelete('set null');

            $table->index('course_id', 'bridging_courses_course_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bridging_courses');
    }
};
