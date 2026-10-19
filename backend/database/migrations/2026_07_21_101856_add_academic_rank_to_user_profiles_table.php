<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Changed to singular 'user_profile'
        Schema::table('user_profile', function (Blueprint $table) {
            $table->string('academic_rank')->nullable()->after('department');
        });
    }

    public function down(): void
    {
        // Changed to singular 'user_profile'
        Schema::table('user_profile', function (Blueprint $table) {
            $table->dropColumn('academic_rank');
        });
    }
};