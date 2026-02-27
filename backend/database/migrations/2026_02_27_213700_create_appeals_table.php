<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('appeals', function (Blueprint $table) {
            $table->id('appeal_id');
            $table->unsignedBigInteger('schedule_id');
            
            $table->string('original_day')->nullable();
            $table->time('original_start_time')->nullable();
            $table->time('original_end_time')->nullable();
            $table->string('original_room_code')->nullable();

            $table->string('day');
            $table->time('start_time');
            $table->time('end_time');
            $table->unsignedBigInteger('room_id')->nullable();
            
            // Justification & Files
            $table->string('file_path')->nullable();
            $table->text('reasoning')->nullable();
            
            // Status & Admin
            $table->tinyInteger('is_approved')->nullable();
            $table->text('admin_remarks')->nullable();
            $table->timestamps();

            $table->index('schedule_id', 'appeals_schedule_id_index');
            $table->index('room_id', 'appeals_room_id_index');
            $table->index('day', 'appeals_day_index');
            $table->index('start_time', 'appeals_start_time_index');
            $table->index('end_time', 'appeals_end_time_index');
            $table->index('file_path', 'appeals_file_path_index');

            // Foreign key
            $table->foreign('schedule_id')->references('schedule_id')->on('schedules')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('appeals');
    }
};
