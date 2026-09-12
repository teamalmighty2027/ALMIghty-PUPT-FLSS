<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50)->unique();
            $table->string('display_name', 100)->nullable();
            $table->timestamps();
        });

        DB::table('roles')->insert([
            [
                'name'         => 'faculty',
                'display_name' => 'Faculty',
                'created_at'   => now(),
                'updated_at'   => now(),
            ],
            [
                'name'         => 'admin',
                'display_name' => 'Admin',
                'created_at'   => now(),
                'updated_at'   => now(),
            ],
            [
                'name'         => 'superadmin',
                'display_name' => 'Super Admin',
                'created_at'   => now(),
                'updated_at'   => now(),
            ],
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('roles');
    }
};
