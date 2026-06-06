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
        if (Schema::hasColumn('user_profile', 'faculty_id')) {
            Schema::table('user_profile', function (Blueprint $table) {
                $fk = DB::selectOne(
                    "SELECT CONSTRAINT_NAME 
                     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                     WHERE TABLE_NAME = 'user_profile' 
                       AND COLUMN_NAME = 'faculty_id'
                       AND REFERENCED_TABLE_NAME IS NOT NULL"
                );

                if ($fk) {
                    DB::statement(
                        'ALTER TABLE user_profile DROP FOREIGN KEY ' .
                        $fk->CONSTRAINT_NAME
                    );
                }

                $table->dropColumn('faculty_id');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('user_profile', function (Blueprint $table) {
            //
        });
    }
};
