<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rescheduling_appeals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('schedule_id');

            // Appeal Details
            $table->string('day');
            $table->time('start_time');
            $table->time('end_time');
            $table->string('room')->nullable();
            
            // Justification & Files
            $table->text('reason')->nullable();
            $table->string('file_path')->nullable();
            
            // Status & Admin
            $table->tinyInteger('is_approved')->nullable();
            $table->text('admin_remarks')->nullable();
            
            $table->timestamps();

            // Foreign key
            $table->foreign('schedule_id')->references('schedule_id')->on('schedules')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rescheduling_appeals');
    }
};