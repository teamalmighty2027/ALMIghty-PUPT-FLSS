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
        Schema::table('faculty', function (Blueprint $table) {
            $table->boolean('is_appeal_enabled')->default(false)->after('idp_user_id');
            $table->boolean('has_appeal_request')->default(false)->after('is_appeal_enabled');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('faculty', function (Blueprint $table) {
            $table->dropColumn(['is_appeal_enabled', 'has_appeal_request']);
        });
    }
};
