<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('faculty_profile', function (Blueprint $table) {
            // Drop the old program_id foreign key and column
            $table->dropForeign(['program_id']); 
            $table->dropColumn('program_id');

            // Add the new columns
            $table->string('department')->nullable()->after('zipcode');
            $table->string('profile_picture')->nullable()->after('faculty_id');
        });
    }

    public function down(): void
    {
        Schema::table('faculty_profile', function (Blueprint $table) {
            $table->dropColumn(['department', 'profile_picture']);
            $table->unsignedInteger('program_id')->nullable();
            $table->foreign('program_id')->references('program_id')->on('programs')->onDelete('set null');
        });
    }
};