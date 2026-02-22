<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('appeals', function (Blueprint $table) {
            $table->id('appeal_id');
            $table->unsignedBigInteger('schedule_id');
            $table->enum('day', ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']);
            $table->time('start_time');
            $table->time('end_time');
            $table->unsignedBigInteger('room_id')->nullable()->comment('Nullable if no specific room is requested');
            $table->string('file_path')->nullable()->comment('Path to supporting documents');
            $table->text('reasoning')->nullable()->comment('Explanation for the appeal');
            $table->boolean('is_approved')->nullable()->default(null);

            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            // Indexes
            $table->index('schedule_id', 'appeals_schedule_id_index');
            $table->index('room_id', 'appeals_room_id_index');
            $table->index('day', 'appeals_day_index');
            $table->index('start_time', 'appeals_start_time_index');
            $table->index('end_time', 'appeals_end_time_index');
            $table->index('file_path', 'appeals_file_path_index');

            // Foreign keys
            $table->foreign('schedule_id')
                  ->references('schedule_id')
                  ->on('schedules')
                  ->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('appeals');
    }
};
