<?php

namespace App\Console\Commands;

use App\Models\ActiveSemester;
use App\Models\Faculty;
use App\Models\Preference;
use App\Models\PreferenceDay;
use App\Models\PreferencesSetting;
use App\Services\AuditLogger;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ManageFacultyPreferencesCommand extends Command
{
    protected $signature = 'preferences:manage
        {--enumerate : List all faculties with preferences in active semester}
        {--reset= : Reset active preferences for a specific faculty ID}
        {--re-arm : Re-arm injection tracker to allow auto-load on next login}
        {--dry-run : Simulate action without making database modifications}
        {--force : Skip confirmation prompt}';

    protected $description = 'Enumerate or reset faculty preferences ' .
        'for the active semester.';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $activeSemester = ActiveSemester::where('is_active', 1)->first();

        if (!$activeSemester) {
            $this->error('No active semester found in the system.');
            return self::FAILURE;
        }

        $semLabel = "AY {$activeSemester->academicYear?->academic_year} " .
            "{$activeSemester->semester?->semester_label}";
        $this->info(
            "Active Semester: {$semLabel} " .
            "(ID: {$activeSemester->active_semester_id})"
        );

        $isEnumerate = $this->option('enumerate');
        $resetId = $this->option('reset');

        if ($isEnumerate || (!$resetId && !$this->input->isInteractive())) {
            return $this->handleEnumerate($activeSemester);
        }

        if ($resetId !== null && $resetId !== '') {
            return $this->handleReset((int) $resetId, $activeSemester);
        }

        // Interactive menu if no options specified
        $choice = $this->choice(
            'Select an action',
            [
                'Enumerate faculties with preferences',
                'Reset a faculty preferences',
                'Exit'
            ],
            0
        );

        if ($choice === 'Enumerate faculties with preferences') {
            return $this->handleEnumerate($activeSemester);
        }

        if ($choice === 'Reset a faculty preferences') {
            $inputFacultyId = $this->ask('Enter Faculty ID to reset:');
            if (!$inputFacultyId) {
                $this->warn('No Faculty ID provided. Aborting.');
                return self::SUCCESS;
            }

            return $this->handleReset((int) $inputFacultyId, $activeSemester);
        }

        return self::SUCCESS;
    }

    // Handles enumeration and tabular display of faculty preferences
    protected function handleEnumerate($activeSemester): int
    {
        $semId = $activeSemester->active_semester_id;

        $faculties = Faculty::with(['user', 'preferencesSetting'])
            ->whereHas('preferences', function ($q) use ($semId) {
                $q->where('active_semester_id', $semId);
            })
            ->get();

        if ($faculties->isEmpty()) {
            $this->warn(
                "No faculty members currently have preferences in active " .
                "semester ID {$semId}."
            );
            return self::SUCCESS;
        }

        $headers = [
            'ID',
            'Faculty Name',
            'Code',
            'Type',
            'Total Prefs',
            'Auto-Injected',
            'Window Status',
            'Evaluated'
        ];

        $rows = [];

        foreach ($faculties as $faculty) {
            $prefs = Preference::where('faculty_id', $faculty->id)
                ->where('active_semester_id', $semId)
                ->get();

            $totalCount = $prefs->count();
            $autoCount = $prefs->where('is_auto_submitted', true)->count();

            $setting = $faculty->preferencesSetting;
            $status = $this->resolveWindowStatus($setting);
            $evaluated = ($setting &&
                $setting->last_injected_active_semester_id == $semId)
                ? 'Yes'
                : 'No';

            $rows[] = [
                $faculty->id,
                $faculty->user?->formatted_name ?? "Faculty #{$faculty->id}",
                $faculty->faculty_code ?? 'N/A',
                $faculty->facultyType?->faculty_type ?? 'N/A',
                $totalCount,
                "{$autoCount} / {$totalCount}",
                $status,
                $evaluated,
            ];
        }

        $this->table($headers, $rows);
        $this->info("Total faculty with preferences: " . count($rows));

        return self::SUCCESS;
    }

    // Handles lookup, confirmation, and reset of a faculty member's preferences
    protected function handleReset(int $facultyId, $activeSemester): int
    {
        $semId = $activeSemester->active_semester_id;

        $faculty = Faculty::with(['user', 'preferencesSetting'])
            ->find($facultyId);

        if (!$faculty) {
            $this->error("Faculty ID {$facultyId} not found in database.");
            return self::FAILURE;
        }

        $facultyName = $faculty->user?->formatted_name
            ?? "Faculty #{$facultyId}";

        $preferences = Preference::with('preferenceDays')
            ->where('faculty_id', $facultyId)
            ->where('active_semester_id', $semId)
            ->get();

        $totalCount = $preferences->count();
        $autoCount = $preferences->where('is_auto_submitted', true)->count();

        $this->line('');
        $this->info("--- Faculty Selected for Reset ---");
        $this->line("Faculty ID:       <comment>{$faculty->id}</comment>");
        $this->line("Faculty Name:     <comment>{$facultyName}</comment>");
        $this->line("Faculty Code:     <comment>{$faculty->faculty_code}</comment>");
        $this->line("Active Semester:  <comment>ID {$semId}</comment>");
        $this->line(
            "Active Records:   <comment>{$totalCount} preferences " .
            "({$autoCount} auto-injected)</comment>"
        );
        $this->line('');

        if ($totalCount === 0) {
            $this->warn(
                "Faculty {$facultyName} has no preferences in active " .
                "semester {$semId}."
            );

            if ($this->confirm(
                "Clear evaluated tracker to allow auto-load on next login?",
                true
            )) {
                $faculty->preferencesSetting()?->update([
                    'last_injected_active_semester_id' => null,
                ]);
                $this->info("Reset evaluated tracker for {$facultyName}.");
            }
            return self::SUCCESS;
        }

        $isDryRun = (bool) $this->option('dry-run');
        if ($isDryRun) {
            $this->warn(
                "[DRY-RUN] Would delete {$totalCount} preference records " .
                "for {$facultyName}."
            );
            return self::SUCCESS;
        }

        $force = (bool) $this->option('force');
        if (!$force && !$this->confirm(
            "Reset all preferences for {$facultyName}?",
            false
        )) {
            $this->warn('Reset operation aborted.');
            return self::SUCCESS;
        }

        $reArm = (bool) $this->option('re-arm');
        if (!$reArm && !$force) {
            $reArm = $this->confirm(
                "Auto-load past preferences when {$facultyName} next logs in?",
                true
            );
        }

        DB::transaction(function () use (
            $preferences,
            $faculty,
            $facultyName,
            $facultyId,
            $semId,
            $totalCount,
            $reArm
        ) {
            foreach ($preferences as $preference) {
                $preference->preferenceDays()->delete();
                $preference->delete();
            }

            if ($reArm) {
                PreferencesSetting::where('faculty_id', $facultyId)->update([
                    'last_injected_active_semester_id' => null,
                ]);
            } else {
                PreferencesSetting::where('faculty_id', $facultyId)->update([
                    'last_injected_active_semester_id' => $semId,
                ]);
            }

            AuditLogger::logDelete(
                model: 'Preference',
                modelId: 0,
                data: [
                    'faculty_id' => $facultyId,
                    'active_semester_id' => $semId,
                    're_armed' => $reArm
                ],
                description: "CLI reset {$totalCount} schedule preferences " .
                    "for {$facultyName} in active semester {$semId}"
            );
        });

        $this->info(
            "Successfully reset {$totalCount} preferences for {$facultyName}."
        );

        if ($reArm) {
            $this->info(
                "Re-arm enabled: Previous preferences will reload as a " .
                "draft when {$facultyName} next logs in."
            );
        } else {
            $this->info(
                "Preferences will remain blank for this semester on next login."
            );
        }

        return self::SUCCESS;
    }

    // Resolves submission window status string from preference settings
    protected function resolveWindowStatus(?PreferencesSetting $setting): string
    {
        if (!$setting || !$setting->is_enabled) {
            return 'Closed';
        }

        $now = Carbon::now('Asia/Manila');
        $start = $setting->individual_start_date ?? $setting->global_start_date;
        $end = $setting->individual_deadline ?? $setting->global_deadline;

        if ($start && $now->lessThan(Carbon::parse($start)->startOfDay())) {
            return 'Scheduled';
        }

        if ($end && $now->greaterThan(Carbon::parse($end)->endOfDay())) {
            return 'Expired';
        }

        return 'Open';
    }
}
