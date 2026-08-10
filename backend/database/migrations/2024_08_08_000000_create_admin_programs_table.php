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
        if (!Schema::hasTable('admin_programs')) {
            Schema::create('admin_programs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->unsignedInteger('program_id');
                $table->timestamps();
                
                // Foreign key constraint for program_id (references program_id, not id)
                $table->foreign('program_id')
                    ->references('program_id')
                    ->on('programs')
                    ->onDelete('cascade');
                
                $table->unique(['user_id', 'program_id']);
                $table->index('program_id');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('admin_programs');
    }
};
