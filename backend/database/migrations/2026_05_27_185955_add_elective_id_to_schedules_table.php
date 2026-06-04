<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schedules', function (Blueprint $table) {
            // Add the column right after section_course_id
            $table->unsignedBigInteger('elective_id')->nullable()->after('section_course_id');
            
            // Link it to our new pool
            $table->foreign('elective_id')->references('elective_id')->on('electives')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::table('schedules', function (Blueprint $table) {
            $table->dropForeign(['elective_id']);
            $table->dropColumn('elective_id');
        });
    }
};