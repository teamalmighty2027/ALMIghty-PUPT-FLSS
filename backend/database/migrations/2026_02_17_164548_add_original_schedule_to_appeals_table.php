<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appeals', function (Blueprint $table) {
            $table->string('original_day')->nullable()->after('schedule_id');
            $table->time('original_start_time')->nullable()->after('original_day');
            $table->time('original_end_time')->nullable()->after('original_start_time');
            $table->string('original_room_code')->nullable()->after('original_end_time');
        });
    }

    public function down(): void
    {
        Schema::table('appeals', function (Blueprint $table) {
            $table->dropColumn(['original_day', 'original_start_time', 'original_end_time', 'original_room_code']);
        });
    }
};