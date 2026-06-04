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
     * 
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
    protected $description = 'Extract, label, and export the scheduling ' . 
        'preference dataset as a CSV file for ML training';

    /**
     * Day encoding map for consistent ML feature representation.
     * 
     * @var array
     */
    private $dayEncoding = [
        'Monday' => 0,
        'Tuesday' => 1,
        'Wednesday' => 2,
        'Thursday' => 3,
        'Friday' => 4,
        'Saturday' => 5,
    ];

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
            $this->error('The --year and --semester options must be ' . 
                'used together to avoid ambiguity, or use --all.');

            return 1;
        }

        if ($all) {
            $this->info('🔄 Querying ALL preference-schedule data...');
        } elseif ($year && $semester) {
            $this->info("🔄 Querying preference-schedule data for " . 
                "Year: {$year}, Semester: {$semester}...");
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

        $processedRows = [];
        $totalScore = 0;
        $buckets = ['0.0' => 0, '0.4' => 0, '0.7+' => 0, '1.0' => 0];

        $this->info('🧪 Processing and encoding features...');

        foreach ($rows as $row) {
            $score = $this->computeMatchScore($row);
            $totalScore += $score;

            // Track distribution for summary
            if ($score >= 1.0) $buckets['1.0']++;
            elseif ($score >= 0.7) $buckets['0.7+']++;
            elseif ($score >= 0.4) $buckets['0.4']++;
            else $buckets['0.0']++;

            $processedRows[] = $this->encodeRow($row, $score);
        }

        $avgScore = $totalScore / $count;

        $this->info('💾 Writing dataset files...');

        $outputPath = $this->option('output') ?? 
            public_path('storage/ml/scheduling_dataset.csv');
        
        $this->writeCsv($processedRows, $outputPath);
        
        $encoderPath = str_replace(
            '.csv', 
            '.json', 
            str_replace('scheduling_dataset', 'encoders', $outputPath)
        );

        $this->writeEncoders($processedRows, $avgScore, $encoderPath, $rows);

        $this->displaySummary(
            $count, 
            $avgScore, 
            $buckets, 
            $processedRows, 
            $outputPath, 
            $encoderPath, 
            $rows
        );

        $this->info('✅ Export completed successfully.');
        
        return 0;
    }

    /**
     * Display a summary of the exported dataset to the console.
     * 
     * @param int $count
     * @param float $avgScore
     * @param array $buckets
     * @param array $processedRows
     * @param string $outputPath
     * @param string $encoderPath
     * @param mixed $rawRows
     * @return void
     */
    private function displaySummary(
        $count, 
        $avgScore, 
        $buckets, 
        $processedRows, 
        $outputPath, 
        $encoderPath, 
        $rawRows
    ) {
        $yearLabels = collect($rawRows)
            ->map(fn($r) => "{$r->year_start}-{$r->year_end}")
            ->unique()
            ->sort()
            ->values()
            ->all();

        $semesters = collect($processedRows)
            ->pluck('semester_id')
            ->unique()
            ->sort()
            ->values()
            ->all();

        $this->newLine();
        $this->line("📅 Academic Years covered : " . implode(', ', $yearLabels));
        $this->line("📆 Semesters covered      : " . implode(', ', $semesters));
        $this->newLine();

        $this->line('📊 Match Score Distribution:');

        $this->line(sprintf(
            '   Score 0.0  (No Match)    : %4d rows  (%5.1f%%)', 
            $buckets['0.0'], 
            ($buckets['0.0'] / $count) * 100
        ));

        $this->line(sprintf(
            '   Score 0.4  (Course Match): %4d rows  (%5.1f%%)', 
            $buckets['0.4'], 
            ($buckets['0.4'] / $count) * 100
        ));

        $this->line(sprintf(
            '   Score 0.7+ (Good Match)  : %4d rows  (%5.1f%%)', 
            $buckets['0.7+'], 
            ($buckets['0.7+'] / $count) * 100
        ));

        $this->line(sprintf(
            '   Score 1.0  (Perfect)     : %4d rows  (%5.1f%%)', 
            $buckets['1.0'], 
            ($buckets['1.0'] / $count) * 100
        ));
        
        $this->newLine();
        $this->line(sprintf('📈 Average Match Score : %.4f', $avgScore));
        $this->newLine();
        
        $this->line("💾 CSV file saved on: " . 
            str_replace('/', DIRECTORY_SEPARATOR, $outputPath));
        
        $this->line("📋 Encoders saved on: " . 
            str_replace('/', DIRECTORY_SEPARATOR, $encoderPath));

        $this->newLine();
    }

    /**
     * Compute the continuous match score (0.0 - 1.0) for a row.
     * 
     * @param object $row
     * @return float
     */
    private function computeMatchScore($row)
    {
        if (!$row->schedule_id) {
            return 0.0;
        }

        $score = 0.40; // Base: assigned the course/section

        // Day match bonus (30%)
        if ($row->actual_day === $row->preferred_day) {
            $score += 0.30;

            // Time match bonus (30%) - only if day matches
            if ($row->actual_start_time && $row->preferred_start_time) {
                $actualSec = strtotime($row->actual_start_time);
                $prefSec = strtotime($row->preferred_start_time);
                $diff = abs($actualSec - $prefSec);

                // Within 2 hours
                if ($diff <= 7200) { 
                    $score += 0.30 * (1 - ($diff / 7200));
                }
            }
        }

        return round($score, 2);
    }

    /**
     * Encode a raw database row into an ML-ready numeric array.
     * 
     * @param object $row
     * @param float $score
     * @return array
     */
    private function encodeRow($row, $score)
    {
        $startMin = $this->timeToMinutes($row->preferred_start_time);
        $endMin = $this->timeToMinutes($row->preferred_end_time);

        return [
            'faculty_id' => $row->faculty_id,
            'academic_year_id' => $row->academic_year_id,
            'semester_id' => $row->semester_id,
            'active_semester_id' => $row->active_semester_id,
            'course_assignment_id' => $row->course_assignment_id,
            'sections_per_program_year_id' => $row->sections_per_program_year_id,
            'is_ignored' => (int) $row->is_ignored,
            'preferred_day_encoded' => $this->dayEncoding[$row->preferred_day] ?? -1,
            'preferred_start_min' => $startMin,
            'preferred_end_min' => $endMin,
            'duration_min' => max(0, $endMin - $startMin),
            'match_score' => $score
        ];
    }

    /**
     * Convert HH:MM:SS time string to minutes since midnight.
     * 
     * @param string|null $time
     * @return int
     */
    private function timeToMinutes($time)
    {
        if (!$time) return 0;
        $parts = explode(':', $time);

        return ((int)$parts[0] * 60) + (int)$parts[1];
    }

    /**
     * Write the processed rows to a CSV file.
     * 
     * @param array $rows
     * @param string $path
     * @return void
     */
    private function writeCsv($rows, $path)
    {
        $dir = dirname($path);

        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $handle = fopen($path, 'w');
        
        // Write header
        fputcsv($handle, array_keys($rows[0]));

        // Write data
        foreach ($rows as $row) {
            fputcsv($handle, $row);
        }

        fclose($handle);
    }

    /**
     * Write the encoder metadata and day mapping to a JSON file.
     * 
     * @param array $rows
     * @param float $avgScore
     * @param string $path
     * @param mixed $rawRows
     * @return void
     */
    private function writeEncoders($rows, $avgScore, $path, $rawRows)
    {
        $yearLabels = collect($rawRows)
            ->map(fn($r) => "{$r->year_start}-{$r->year_end}")
            ->unique()
            ->sort()
            ->values()
            ->all();

        $semesters = collect($rows)
            ->pluck('semester_id')
            ->unique()
            ->sort()
            ->values()
            ->all();

        $metadata = [
            'model_version' => '2026-S1',
            'exported_at' => now()->toIso8601String(),
            'total_rows' => count($rows),
            'average_match_score' => round($avgScore, 4),
            'training_years' => $yearLabels,
            'training_semesters' => $semesters,
            'day_encoding' => $this->dayEncoding,
            'schema' => array_keys($rows[0])
        ];

        file_put_contents($path, json_encode($metadata, JSON_PRETTY_PRINT));
    }

    /**
     * Build the raw SQL query to extract preference-schedule matches.
     * 
     * @param string|null $year
     * @param string|null $semester
     * @return mixed
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
            ->join(
                'active_semesters as asem', 
                'p.active_semester_id', 
                '=', 
                'asem.active_semester_id'
            )
            ->join(
                'academic_years as ay', 
                'asem.academic_year_id', 
                '=', 
                'ay.academic_year_id'
            )
            ->join(
                'preference_days as pd', 
                'p.preferences_id', 
                '=', 
                'pd.preference_id'
            )
            ->leftJoin('section_courses as sc', function($join) {
                $join->on('p.course_assignment_id', '=', 'sc.course_assignment_id')
                     ->on(
                        'p.sections_per_program_year_id', 
                        '=', 
                        'sc.sections_per_program_year_id'
                    );
            })
            ->leftJoin('schedules as s', function($join) {
                $join->on('sc.section_course_id', '=', 's.section_course_id')
                     ->on('s.faculty_id', '=', 'p.faculty_id');
            });

        if ($year && $semester) {
            $query->where('ay.year_start', $year)
                  ->where('asem.semester_id', $semester);
        }

        return $query->get();
    }
}
