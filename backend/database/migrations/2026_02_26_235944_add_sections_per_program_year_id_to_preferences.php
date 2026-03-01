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
        Schema::table('preferences', function (Blueprint $table) {            
            $table->unsignedBigInteger('sections_per_program_year_id')->nullable()->after('faculty_id');
            $table->foreign('sections_per_program_year_id')
                  ->references('sections_per_program_year_id')
                  ->on('sections_per_program_year')
                  ->onDelete('set null');
                  
            // If unique index already exists, drop it 
            if (Schema::hasIndex('preferences', 'unique_preference')) {
                $table->dropUnique('unique_preference');
            }
            $table->unique(
                ['faculty_id', 'active_semester_id', 'course_assignment_id', 'sections_per_program_year_id'],
                'unique_preference'
            );
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('preferences', function (Blueprint $table) {
            $table->dropForeign(['sections_per_program_year_id']);
            $table->dropColumn('sections_per_program_year_id');
        });
    }
};
