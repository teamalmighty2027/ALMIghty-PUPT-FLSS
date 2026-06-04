<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Check if migration already ran
        if (Schema::hasTable('user_profile')) {
            return;
        }

        // 1. Rename the table
        Schema::rename('faculty_profile', 'user_profile');

        Schema::table('user_profile', function (Blueprint $table) {
            // 2. Add user_id column
            $table->unsignedBigInteger('user_id')->nullable()->after('faculty_profile_id');
            
            // 3. Rename the primary key column (using raw SQL for compatibility)
            // Note: In older Laravel/MySQL, you might need to drop and re-add or use DB::statement
        });

        // Use raw SQL to rename the primary key column if renameColumn is not supported or for clarity
        DB::statement('ALTER TABLE user_profile CHANGE faculty_profile_id user_profile_id BIGINT UNSIGNED AUTO_INCREMENT');

        // 4. Populate user_id from faculty table
        DB::table('user_profile')
            ->join('faculty', 'user_profile.faculty_id', '=', 'faculty.id')
            ->update(['user_profile.user_id' => DB::raw('faculty.user_id')]);

        Schema::table('user_profile', function (Blueprint $table) {
            // 5. Add foreign key and index for user_id
            $table->foreign('user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            
            $table->index('user_id');

            // 6. Drop the old faculty_id column and its foreign key
            $table->dropForeign(['faculty_id']);
            $table->dropColumn('faculty_id');
        });

        // 7. Remove faculty_profile_id from faculty table as it's no longer needed
        if (Schema::hasColumn('faculty', 'faculty_profile_id')) {
            Schema::table('faculty', function (Blueprint $table) {
                $table->dropForeign(['faculty_profile_id']);
                $table->dropColumn('faculty_profile_id');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Check if rollback is needed
        if (!Schema::hasTable('user_profile')) {
            return;
        }
        Schema::table('faculty', function (Blueprint $table) {
            $table->unsignedBigInteger('faculty_profile_id')->nullable()->after('id');
        });

        Schema::table('user_profile', function (Blueprint $table) {
            $table->unsignedBigInteger('faculty_id')->nullable()->after('user_profile_id');
        });

        // Restore data
        DB::table('user_profile')
            ->join('faculty', 'user_profile.user_id', '=', 'faculty.user_id')
            ->update(['user_profile.faculty_id' => DB::raw('faculty.id')]);

        DB::table('faculty')
            ->join('user_profile', 'faculty.user_id', '=', 'user_profile.user_id')
            ->update(['faculty.faculty_profile_id' => DB::raw('user_profile.user_profile_id')]);

        Schema::table('user_profile', function (Blueprint $table) {
            $table->foreign('faculty_id')
                ->references('id')
                ->on('faculty')
                ->cascadeOnDelete();
            
            $table->dropForeign(['user_id']);
            $table->dropColumn('user_id');
        });

        Schema::table('faculty', function (Blueprint $table) {
            $table->foreign('faculty_profile_id')
                ->references('user_profile_id')
                ->on('user_profile')
                ->restrictOnDelete();
        });

        DB::statement('ALTER TABLE user_profile CHANGE user_profile_id faculty_profile_id BIGINT UNSIGNED AUTO_INCREMENT');

        Schema::rename('user_profile', 'faculty_profile');
    }
};
