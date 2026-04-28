<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('faculty', function (Blueprint $table) {
            $table->dateTime('appeal_start_date')->nullable()->after('is_appeal_enabled');
            $table->dateTime('appeal_end_date')->nullable()->after('appeal_start_date');
        });
    }

    public function down(): void
    {
        Schema::table('faculty', function (Blueprint $table) {
            $table->dropColumn(['appeal_start_date', 'appeal_end_date']);
        });
    }
};