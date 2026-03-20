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
        // Rename fesr_user_id to idp_user_id in faculty table
        if (Schema::hasTable('faculty')) {
            if (Schema::hasColumn('faculty', 'fesr_user_id')) {
                // First rename the column
                Schema::table('faculty', function (Blueprint $table) {
                    $table->renameColumn('fesr_user_id', 'idp_user_id');
                });
                
                // Change the column type to string (varchar) with length 36 to accommodate UUIDs
                Schema::table('faculty', function (Blueprint $table) {
                    $table->string('idp_user_id', 36)->nullable()->change();
                });
                
                // Change the column type to UUID (char(36))
                Schema::table('faculty', function (Blueprint $table) {
                    $table->uuid('idp_user_id')->nullable()->change();
                });
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('faculty')) {
            if (Schema::hasColumn('faculty', 'idp_user_id')) {
                // First change the column type back to string, then to unsignedBigInteger
                Schema::table('faculty', function (Blueprint $table) {
                    $table->string('idp_user_id', 36)->nullable()->change();
                });
                
                // Then rename and change to original type
                Schema::table('faculty', function (Blueprint $table) {
                    $table->renameColumn('idp_user_id', 'fesr_user_id');
                });
                
                Schema::table('faculty', function (Blueprint $table) {
                    $table->unsignedBigInteger('fesr_user_id')->nullable()->change();
                });
            }
        }
    }
};
