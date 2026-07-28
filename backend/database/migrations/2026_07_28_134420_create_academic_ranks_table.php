<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('academic_ranks', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->boolean('is_active')->default(true); // Allows you to disable old ranks without deleting them
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('academic_ranks');
    }
};