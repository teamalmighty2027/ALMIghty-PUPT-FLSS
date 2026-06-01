<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Create the electives table.
     */
    public function up(): void
    {
        Schema::create('electives', function (Blueprint $table) {
            $table->increments('elective_id');
            $table->string('elective_slot_name', 50);
            $table->string('course_code', 50);
            $table->string('course_title', 100);
            $table->integer('lec_hours');
            $table->integer('lab_hours');
            $table->integer('units');
            $table->integer('tuition_hours');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('elective_slot_name');
            $table->index('is_active');
        });
    }

    /**
     * Drop the electives table.
     */
    public function down(): void
    {
        Schema::dropIfExists('electives');
    }
};
