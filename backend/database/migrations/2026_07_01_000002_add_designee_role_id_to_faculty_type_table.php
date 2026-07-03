<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Adds designee_role_id FK to faculty_type and seeds designee sub-types.
    public function up(): void
    {
        Schema::table('faculty_type', function (Blueprint $table) {
            $table->unsignedBigInteger('designee_role_id')
                ->nullable()
                ->after('additional_units');

            $table->foreign('designee_role_id')
                ->references('designee_role_id')
                ->on('designee_role')
                ->onDelete('restrict');
        });

        // Seed designee sub-type rows
        $director = DB::table('designee_role')
            ->where('role_name', 'Director')
            ->first();

        $hap = DB::table('designee_role')
            ->where('role_name', 'HAP')
            ->first();

        if ($director && $hap) {
            DB::table('faculty_type')->insert([
                [
                    'faculty_type' => 'Designee - Director',
                    'regular_units' => 6,
                    'additional_units' => 0,
                    'designee_role_id' => $director->designee_role_id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'faculty_type' => 'Designee - HAP',
                    'regular_units' => 6,
                    'additional_units' => 0,
                    'designee_role_id' => $hap->designee_role_id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);
        }
    }

    // Rollback the foreign key and drop seeded faculty types.
    public function down(): void
    {
        DB::table('faculty_type')
            ->whereIn('faculty_type', [
                'Designee - Director',
                'Designee - HAP',
            ])
            ->delete();

        Schema::table('faculty_type', function (Blueprint $table) {
            $table->dropForeign(['designee_role_id']);
            $table->dropColumn('designee_role_id');
        });
    }
};
