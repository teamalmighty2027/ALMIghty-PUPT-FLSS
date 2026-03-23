<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('internal_arrangements', function (Blueprint $table) {
            $table->id('arrangement_id');
            // cascadeOnDelete means if the official schedule is deleted, the arrangement is too
            $table->foreignId('schedule_id')->constrained('schedules', 'schedule_id')->cascadeOnDelete();
            $table->foreignId('appeal_id')->constrained('appeals', 'appeal_id')->cascadeOnDelete();
            
            $table->enum('day', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
            $table->time('start_time');
            $table->time('end_time');
            
            // nullOnDelete means if a room is deleted from the system, it just empties this field
            $table->foreignId('room_id')->nullable()->constrained('rooms', 'room_id')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('internal_arrangements');
    }
};