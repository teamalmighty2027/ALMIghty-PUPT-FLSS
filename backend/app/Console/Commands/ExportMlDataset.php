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
            $this->info('🔄 Querying ALL schedule data...');
        } elseif ($year && $semester) {
            $this->info("🔄 Querying schedule data for " . 
                "Year: {$year}, Semester: {$semester}...");
        } else {
            $this->info('🔄 Querying ALL schedule data (default)...');
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

        $rawRows = $rows->all();
        $frequencyMap = [];
        $positiveKeys = [];

        foreach ($rawRows as $row) {
            $key = "{$row->faculty_id}_{$row->course_id}_{$row->day}" .
                   "_{$row->start_time}_{$row->end_time}";
            $frequencyMap[$key] = ($frequencyMap[$key] ?? 0) + 1;
            $positiveKeys[$key] = true;
        }

        $maxOccurrences = empty($frequencyMap) ? 1 : max($frequencyMap);
        $negativeRows = $this->generateNegativeSamples($rawRows, $positiveKeys);
        $this->info("🧪 Generated " . count($negativeRows) . 
            " negative samples.");

        foreach ($rawRows as $row) {
            $key = "{$row->faculty_id}_{$row->course_id}_{$row->day}" .
                   "_{$row->start_time}_{$row->end_time}";
            $occurrences = $frequencyMap[$key] ?? 1;

            $baseScore = 0.5;
            $bonus = min(0.5, ($occurrences / $maxOccurrences) * 0.5);
            $score = round($baseScore + $bonus, 2);

            $totalScore += $score;

            if ($score >= 1.0) {
                $buckets['1.0']++;
            } elseif ($score >= 0.7) {
                $buckets['0.7+']++;
            } elseif ($score >= 0.4) {
                $buckets['0.4']++;
            } else {
                $buckets['0.0']++;
            }

            $processedRows[] = $this->encodeRow($row, $score);
        }

        foreach ($negativeRows as $row) {
            $score = 0.0;
            $totalScore += $score;
            $buckets['0.0']++;

            $processedRows[] = $this->encodeRow($row, $score);
        }

        $totalCount = count($processedRows);
        $avgScore = $totalCount > 0 ? ($totalScore / $totalCount) : 0;

        $this->info('💾 Writing dataset files...');

        $outputPath = $this->option('output') ?? 
            public_path('storage/ml/scheduling_dataset.csv');
        
        $this->writeCsv($processedRows, $outputPath);
        
        $encoderPath = str_replace(
            '.csv', 
            '.json', 
            str_replace('scheduling_dataset', 'encoders', $outputPath)
        );

        $this->writeEncoders($processedRows, $avgScore, $encoderPath, $rawRows);

        $this->displaySummary(
            $totalCount, 
            $avgScore, 
            $buckets, 
            $processedRows, 
            $outputPath, 
            $encoderPath, 
            $rawRows
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
     * Generate synthetic negative samples (score 0.0) from existing data.
     * 
     * @param array $rawRows
     * @param array $positiveKeys
     * @return array
     */
    private function generateNegativeSamples($rawRows, $positiveKeys)
    {
        $negatives = [];
        
        $allFacultyIds = collect($rawRows)
            ->pluck('faculty_id')
            ->unique()
            ->toArray();

        $allDays = [
            'Monday', 'Tuesday', 'Wednesday', 
            'Thursday', 'Friday', 'Saturday'
        ];

        $allTimeSlots = collect($rawRows)
            ->map(fn($r) => ['start' => $r->start_time, 'end' => $r->end_time])
            ->unique()
            ->values()
            ->toArray();

        if (empty($allFacultyIds) || empty($allTimeSlots)) {
            return [];
        }

        $positiveCount = count($rawRows);
        $attempts = 0;
        $maxAttempts = $positiveCount * 5;

        while (count($negatives) < $positiveCount && $attempts < $maxAttempts) {
            $attempts++;
            $baseRow = $rawRows[array_rand($rawRows)];

            $randomFacultyId = $allFacultyIds[array_rand($allFacultyIds)];
            $randomDay = $allDays[array_rand($allDays)];
            $randomSlot = $allTimeSlots[array_rand($allTimeSlots)];

            $key = "{$randomFacultyId}_{$baseRow->course_id}_{$randomDay}" .
                   "_{$randomSlot['start']}_{$randomSlot['end']}";

            if (!isset($positiveKeys[$key])) {
                $negRow = (object) [
                    'faculty_id' => $randomFacultyId,
                    'academic_year_id' => $baseRow->academic_year_id,
                    'semester_id' => $baseRow->semester_id,
                    'active_semester_id' => $baseRow->active_semester_id,
                    'course_id' => $baseRow->course_id,
                    'program_id' => $baseRow->program_id,
                    'year_level' => $baseRow->year_level,
                    'day' => $randomDay,
                    'start_time' => $randomSlot['start'],
                    'end_time' => $randomSlot['end'],
                    'year_start' => $baseRow->year_start,
                    'year_end' => $baseRow->year_end,
                ];

                $negatives[] = $negRow;
                $positiveKeys[$key] = true;
            }
        }

        return $negatives;
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
        $startMin = $this->timeToMinutes($row->start_time);
        $endMin = $this->timeToMinutes($row->end_time);

        return [
            'faculty_id' => $row->faculty_id,
            'academic_year_id' => $row->academic_year_id,
            'semester_id' => $row->semester_id,
            'active_semester_id' => $row->active_semester_id,
            'course_id' => $row->course_id,
            'program_id' => $row->program_id,
            'year_level' => (int) $row->year_level,
            'day_encoded' => $this->dayEncoding[$row->day] ?? -1,
            'start_time_min' => $startMin,
            'end_time_min' => $endMin,
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
            'model_version' => '2026-v2',
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
     * Build the raw SQL query to extract schedule records.
     * 
     * @param string|null $year
     * @param string|null $semester
     * @return \Illuminate\Support\Collection
     */
    private function buildQuery($year = null, $semester = null)
    {
        $query = DB::table('schedules as s')
            ->join(
                'section_courses as sc',
                's.section_course_id',
                '=',
                'sc.section_course_id'
            )
            ->join(
                'course_assignments as ca',
                'sc.course_assignment_id',
                '=',
                'ca.course_assignment_id'
            )
            ->join(
                'semesters as sem',
                'ca.semester_id',
                '=',
                'sem.semester_id'
            )
            ->join(
                'sections_per_program_year as spy',
                'sc.sections_per_program_year_id',
                '=',
                'spy.sections_per_program_year_id'
            )
            ->join(
                'active_semesters as asem',
                'spy.academic_year_id',
                '=',
                'asem.academic_year_id'
            )
            ->whereColumn('sem.semester', 'asem.semester_id')
            ->join(
                'academic_years as ay',
                'asem.academic_year_id',
                '=',
                'ay.academic_year_id'
            )
            ->whereNotNull('s.faculty_id')
            ->whereNotNull('s.day')
            ->whereNotNull('s.start_time')
            ->whereNotNull('s.end_time')
            ->select([
                's.faculty_id',
                'asem.academic_year_id',
                'asem.semester_id',
                'asem.active_semester_id',
                'ca.course_id',
                'spy.program_id',
                'spy.year_level',
                's.day',
                's.start_time',
                's.end_time',
                'ay.year_start',
                'ay.year_end',
            ]);

        if ($year && $semester) {
            $query->where('ay.year_start', $year)
                  ->where('asem.semester_id', $semester);
        }

        return $query->get();
    }
}
