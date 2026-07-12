<?php

namespace Database\Seeders;

use App\Models\AssignmentType;
use Illuminate\Database\Seeder;

class LoadTypeSeeder extends Seeder
{
    /**
     * Run the database seeds to create the default load types.
     */
    public function run(): void
    {
        $types = [
            'Part-Time',
            'Regular',
            'Temporary Substitution',
            'Tutorial',
        ];

        foreach ($types as $type) {
            AssignmentType::firstOrCreate(['name' => $type]);
        }
    }
}
