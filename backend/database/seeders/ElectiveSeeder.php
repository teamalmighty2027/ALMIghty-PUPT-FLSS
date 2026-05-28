<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ElectiveSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('electives')->insert([
            [
                'elective_slot_name' => 'ECE Elective 1',
                'course_code' => 'ECEN 351',
                'course_title' => 'Analog IC Design',
                'lec_hours' => 3,
                'lab_hours' => 0,
                'units' => 3,
                'tuition_hours' => 3,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'elective_slot_name' => 'ECE Elective 1',
                'course_code' => 'ECEN 352',
                'course_title' => 'Advanced Power Supply System',
                'lec_hours' => 3,
                'lab_hours' => 0,
                'units' => 3,
                'tuition_hours' => 3,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }
}