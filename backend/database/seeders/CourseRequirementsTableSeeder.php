<?php

namespace Database\Seeders;

use Database\Seeders\Csv\CsvToArray;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CourseRequirementsTableSeeder extends Seeder
{
    public function run()
    {
        $csvPath = database_path('seeders/csv/course_requirements.csv');

        try {
            $csvData = CsvToArray::convert($csvPath);
        } catch (\Exception $e) {
            $this->command->error($e->getMessage());
            return;
        }

        $dataToInsert = [];

        foreach ($csvData as $record) {
            $dataToInsert[] = [
                'requirement_id' => $record['requirement_id'],
                'course_id' => $record['course_id'],
                'requirement_type' => $record['requirement_type'],
                'required_course_id' => $record['required_course_id'],
                'created_at' => $record['created_at'],
                'updated_at' => $record['updated_at'],
            ];
        }

        try {
            DB::table('course_requirements')->insert($dataToInsert);
            $this->command->info('Course requirements table seeded successfully!');
        } catch (\Exception $e) {
            $this->command->error('Error seeding course requirements table: ' . $e->getMessage());
        }
    }
}
