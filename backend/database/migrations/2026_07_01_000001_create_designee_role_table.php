<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Creates the designee_role table and seeds initial roles.
    public function up(): void
    {
        Schema::create('designee_role', function (Blueprint $table) {
            $table->id('designee_role_id');
            $table->string('role_name')->unique();
            $table->integer('regular_units')->default(0);
            $table->integer('additional_units')->default(0);
            $table->timestamps();
        });

        // Seed initial designee roles
        DB::table('designee_role')->insert([
            [
                'role_name' => 'Director',
                'regular_units' => 6,
                'additional_units' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'role_name' => 'HAP',
                'regular_units' => 6,
                'additional_units' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    // Drops the designee_role table.
    public function down(): void
    {
        Schema::dropIfExists('designee_role');
    }
};
