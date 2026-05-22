<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('faculty_type')->updateOrInsert(
            ['faculty_type' => 'Special Lecturer'],
            [
                'regular_units' => 12,
                'additional_units' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }

    public function down(): void
    {
        DB::table('faculty_type')->where('faculty_type', 'Special Lecturer')->delete();
    }
};