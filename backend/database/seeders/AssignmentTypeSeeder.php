<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\AssignmentType;

class AssignmentTypeSeeder extends Seeder
{
    public function run()
    {
        $types = [
            'Regular Load',
            'Part Time',
            'Temporary Substitution',
            'Tutorial',
            'Dynamic'
        ];

        foreach ($types as $type) {
            AssignmentType::firstOrCreate(['name' => $type]);
        }
    }
}
