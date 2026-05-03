<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use App\Models\Preference;

class ExportMlDataset extends Command
{
    /**
     * The name and signature of the console command.
     * Example:
     *  php artisan ml:export-dataset --year=2024 --semester=1
     * @var string
     */
    protected $signature = 'ml:export-dataset 
        {--year= : Filter by academic year (matches year_start)} 
        {--semester= : Filter by semester number (1, 2, or 3)} 
        {--all : Export all academic years and semesters}
        {--output= : Override the default output file path}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Extract, label, and export the scheduling preference dataset as a CSV file for ML training';

    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle()
    {
        $year = $this->option('year');
        $semester = $this->option('semester');
        $all = $this->option('all');

        if (!$all && (($year && !$semester) || (!$year && $semester))) {
            $this->error('The --year and --semester options must be used together to avoid ambiguity, or use --all.');
            return 1;
        }

        if ($all) {
            $this->info('🔄 Querying ALL preference-schedule data...');
        } elseif ($year && $semester) {
            $this->info("🔄 Querying preference-schedule data for Year: {$year}, Semester: {$semester}...");
        } else {
            $this->info('🔄 Querying ALL preference-schedule data (default)...');
        }

        $rows = $this->buildQuery($all ? null : $year, $all ? null : $semester);
        $count = count($rows);

        if ($count === 0) {
            $this->warn('⚠️ No rows found for the specified criteria.');
            return 0;
        }

        $this->info("✅ {$count} rows fetched.");

        // Placeholder for Steps 3-7
        // For now, just confirming Step 2 works
        $this->info('Data extraction completed (Step 1 & 2).');
        
        return 0;
    }

    /**
     * Build the raw SQL query to extract preference-schedule matches.
     * 
     * @param string|null $year
     * @param string|null $semester
     * @return array
     */
    private function buildQuery($year = null, $semester = null)
    {
        $query = Preference::query()
            ->from('preferences as p')
            ->select([
                'p.faculty_id',
                'asem.academic_year_id',
                'asem.semester_id',
                'p.active_semester_id',
                'p.course_assignment_id',
                'p.sections_per_program_year_id',
                'p.is_ignored',
                'pd.preferred_day',
                'pd.preferred_start_time',
                'pd.preferred_end_time',
                's.schedule_id',
                's.day as actual_day',
                's.start_time as actual_start_time',
                'ay.year_start',
                'ay.year_end'
            ])
            ->join('active_semesters as asem', 'p.active_semester_id', '=', 'asem.active_semester_id')
            ->join('academic_years as ay', 'asem.academic_year_id', '=', 'ay.academic_year_id')
            ->join('preference_days as pd', 'p.preferences_id', '=', 'pd.preference_id')
            ->leftJoin('section_courses as sc', function($join) {
                $join->on('p.course_assignment_id', '=', 'sc.course_assignment_id')
                     ->on('p.sections_per_program_year_id', '=', 'sc.sections_per_program_year_id');
            })
            ->leftJoin('schedules as s', function($join) {
                $join->on('sc.section_course_id', '=', 's.section_course_id')
                     ->on('s.faculty_id', '=', 'p.faculty_id');
            });

        if ($year && $semester) {
            $query->where('ay.year_start', $year)
                  ->where('asem.semester_id', $semester);
        }

        return $query->get()->toArray();
    }
}
