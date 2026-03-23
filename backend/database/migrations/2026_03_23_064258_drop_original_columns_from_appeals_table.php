<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appeals', function (Blueprint $table) {
            $table->dropColumn([
                'original_day', 
                'original_start_time', 
                'original_end_time', 
                'original_room_code'
            ]);
        });
    }

    public function down(): void
    {
        Schema::table('appeals', function (Blueprint $table) {
            $table->enum('original_day', ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])->nullable();
            $table->time('original_start_time')->nullable();
            $table->time('original_end_time')->nullable();
            $table->string('original_room_code')->nullable();
        });
    }
};