<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Creates faculty_time_plots table.
     */
    public function up(): void
    {
        Schema::create('faculty_time_plots', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('faculty_id');
            $table->unsignedInteger('active_semester_id');
            $table->enum('time_type', [
                'night_service',
                'official_time',
                'advising_time',
            ]);
            $table->enum('day', [
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday',
                'Sunday',
            ]);
            $table->time('start_time');
            $table->time('end_time');
            $table->timestamps();

            $table->foreign('faculty_id')
                ->references('id')
                ->on('faculty')
                ->onDelete('cascade');

            $table->foreign('active_semester_id')
                ->references('active_semester_id')
                ->on('active_semesters')
                ->onDelete('cascade');

            $table->index('faculty_id');
            $table->index('active_semester_id');
            $table->index('day');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('faculty_time_plots');
    }
};
