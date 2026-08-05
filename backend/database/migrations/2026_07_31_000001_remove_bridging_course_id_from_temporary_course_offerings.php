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
        try {
            Schema::table('temporary_course_offerings', function (Blueprint $table) {
                $table->dropForeign(['bridging_course_id']);
            });
        } catch (\Exception $e) {
            // Ignore if foreign key constraint does not exist
        }

        try {
            Schema::table('temporary_course_offerings', function (Blueprint $table) {
                $table->dropIndex('temp_offerings_bridging_idx');
            });
        } catch (\Exception $e) {
            // Ignore if index does not exist
        }

        Schema::table('temporary_course_offerings', function (Blueprint $table) {
            $table->dropColumn('bridging_course_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('temporary_course_offerings', function (Blueprint $table) {
            $table->unsignedBigInteger('bridging_course_id')->nullable()->after('course_id');
            $table->foreign('bridging_course_id')
                  ->references('bridging_course_id')
                  ->on('bridging_courses')
                  ->onDelete('set null');
            $table->index('bridging_course_id', 'temp_offerings_bridging_idx');
        });
    }
};