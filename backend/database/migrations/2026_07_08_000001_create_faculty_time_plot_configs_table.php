<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Creates faculty_time_plot_configs table and seeds initial caps.
     */
    public function up(): void
    {
        Schema::create('faculty_time_plot_configs', function (Blueprint $table) {
            $table->id();
            $table->string('time_type')->unique();
            $table->unsignedInteger('weekly_hours_cap');
            $table->timestamps();
        });

        // Seed initial caps for designee roles and regular/temp faculty
        DB::table('faculty_time_plot_configs')->insert([
            [
                'time_type' => 'night_service',
                'weekly_hours_cap' => 15,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'time_type' => 'official_time',
                'weekly_hours_cap' => 40,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'time_type' => 'advising_time',
                'weekly_hours_cap' => 10,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('faculty_time_plot_configs');
    }
};
