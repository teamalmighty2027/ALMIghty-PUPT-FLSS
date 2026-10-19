<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\AcademicRank;

class AcademicRankSeeder extends Seeder
{
    public function run(): void
    {
        $ranks = [
            'Instructor I', 'Instructor II', 'Instructor III',
            'Assistant Professor I', 'Assistant Professor II', 'Assistant Professor III', 'Assistant Professor IV',
            'Associate Professor I', 'Associate Professor II', 'Associate Professor III', 'Associate Professor IV', 'Associate Professor V',
            'Professor I', 'Professor II', 'Professor III', 'Professor IV', 'Professor V', 'Professor VI',
            'Special Lecturer'
        ];

        foreach ($ranks as $rank) {
            AcademicRank::firstOrCreate(['name' => $rank]);
        }
    }
}