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
        Schema::table('preferences_settings', function (Blueprint $table) {
            $table->unsignedInteger('last_injected_active_semester_id')
                ->nullable()
                ->after('individual_deadline');

            $table->foreign('last_injected_active_semester_id')
                ->references('active_semester_id')
                ->on('active_semesters')
                ->nullOnDelete();

            $table->index('last_injected_active_semester_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('preferences_settings', function (Blueprint $table) {
            $table->dropForeign(['last_injected_active_semester_id']);
            $table->dropIndex(['last_injected_active_semester_id']);
            $table->dropColumn('last_injected_active_semester_id');
        });
    }
};
