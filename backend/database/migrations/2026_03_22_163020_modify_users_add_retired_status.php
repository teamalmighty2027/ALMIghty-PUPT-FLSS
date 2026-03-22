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
        Schema::table('users', function (Blueprint $table) {
            // Alter status column to include 'Retired' option and set default to 'Active'
            $table->enum('status', ['Active', 'Inactive', 'Retired'])->default('Active')->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        //
        Schema::table('users', function (Blueprint $table) {
            // Revert status column to only include 'Active' and 'Inactive' options
            $table->enum('status', ['Active', 'Inactive'])->default('Active')->change();
        });
    }
};
