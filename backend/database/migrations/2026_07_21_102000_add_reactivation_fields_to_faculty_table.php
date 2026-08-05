<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations to add has_reactivation_request column.
     */
    public function up(): void
    {
        Schema::table('faculty', function (Blueprint $table) {
            $table->boolean('has_reactivation_request')
                ->default(false)
                ->after('has_appeal_request');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('faculty', function (Blueprint $table) {
            $table->dropColumn('has_reactivation_request');
        });
    }
};
