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
        Schema::table('temporary_course_offerings', function (Blueprint $table) {
            // Drop the foreign key constraint first
            $table->dropForeign(['bridging_course_id']);
            // Drop the column
            $table->dropColumn('bridging_course_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('temporary_course_offerings', function (Blueprint $table) {
            $table->unsignedBigInteger('bridging_course_id')->nullable();
            $table->foreign('bridging_course_id')
                  ->references('bridging_course_id')
                  ->on('bridging_courses')
                  ->onDelete('set null');
        });
    }
};