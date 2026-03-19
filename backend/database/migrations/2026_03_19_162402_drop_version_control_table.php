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
        Schema::dropIfExists('version_control');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        throw new \RuntimeException('This migration drops the version_control table and cannot be safely rolled back.');
    }
};
