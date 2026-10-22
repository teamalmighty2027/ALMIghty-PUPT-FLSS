<?php

namespace App\Console\Commands;

use App\Models\PreferencesSetting;
use Carbon\Carbon;
use Illuminate\Console\Command;
use App\Jobs\NotifyFacultyDeadlineSingleJob;
use Illuminate\Support\Facades\Log;
use App\Jobs\NotifyGlobalFacultyDeadlineJob;

class CheckPreferencesDeadline extends Command
{
    protected $signature = 'preferences:check-deadline';
    protected $description = 'Check and disable preferences submission after deadlines (global or individual)';

    public function handle()
    {
        $today = Carbon::now('Asia/Manila');

        // Disable preferences and clear deadlines and start dates if past
        PreferencesSetting::query()
            ->whereNotNull('global_deadline')
            ->whereDate('global_deadline', '<', $today)
            ->update([
                'is_enabled'        => false,
                'global_deadline'   => null,
                'global_start_date' => null,
            ]);

        PreferencesSetting::query()
            ->whereNotNull('individual_deadline')
            ->whereDate('individual_deadline', '<', $today)
            ->update([
                'is_enabled'            => false,
                'individual_deadline'   => null,
                'individual_start_date' => null,
            ]);

        // Clean up orphaned past start dates for disabled preferences
        PreferencesSetting::query()
            ->where('is_enabled', false)
            ->whereNull('global_deadline')
            ->whereNotNull('global_start_date')
            ->whereDate('global_start_date', '<=', $today->copy()->startOfDay())
            ->update([
                'global_start_date' => null,
            ]);

        PreferencesSetting::query()
            ->where('is_enabled', false)
            ->whereNull('individual_deadline')
            ->whereNotNull('individual_start_date')
            ->whereDate(
                'individual_start_date',
                '<=',
                $today->copy()->startOfDay()
            )
            ->update([
                'individual_start_date' => null,
            ]);

        // Enable preferences if scheduled start date has arrived and active
        PreferencesSetting::query()
            ->where('is_enabled', false)
            ->whereNotNull('global_start_date')
            ->whereDate(
                'global_start_date',
                '<=',
                $today->copy()->startOfDay()
            )
            ->where(function ($query) use ($today) {
                $query->whereNull('global_deadline')
                    ->orWhereDate(
                        'global_deadline',
                        '>=',
                        $today->copy()->startOfDay()
                    );
            })
            ->update([
                'is_enabled' => true,
            ]);

        PreferencesSetting::query()
            ->where('is_enabled', false)
            ->whereNotNull('individual_start_date')
            ->whereDate(
                'individual_start_date',
                '<=',
                $today->copy()->startOfDay()
            )
            ->where(function ($query) use ($today) {
                $query->whereNull('individual_deadline')
                    ->orWhereDate(
                        'individual_deadline',
                        '>=',
                        $today->copy()->startOfDay()
                    );
            })
            ->update([
                'is_enabled' => true,
            ]);

        $this->info('Preferences deadline check completed successfully.');


        $tomorrow = Carbon::now('Asia/Manila')->addDay()->startOfDay();

        $faculties = PreferencesSetting::with('faculty.user')
            ->where('is_enabled', true)
            ->whereHas('faculty.user', function ($q) {
                $q->where('status', 'Active');
            })
            ->whereNotNull('individual_deadline')
            ->whereDate('individual_deadline', $tomorrow)
            ->get();

        if ($faculties->isEmpty()) {
            $this->info(
                'No active faculty members with enabled preferences have ' .
                'deadlines in the next 24 hours.'
            );
        } else {
            foreach ($faculties as $preference) {
                if ($preference->faculty && $preference->faculty->user) {
                    NotifyFacultyDeadlineSingleJob::dispatch(
                        $preference->faculty
                    );
                    Log::info(
                        "Notification dispatched for faculty ID: " .
                        "{$preference->faculty->id}"
                    );
                }
            }
            $this->info(
                '✅ Faculty deadline notifications dispatched successfully.'
            );
        }

        // Check for global deadline
        $globalSettings = PreferencesSetting::with('faculty.user')
            ->where('is_enabled', true)
            ->whereHas('faculty.user', function ($q) {
                $q->where('status', 'Active');
            })
            ->whereNotNull('global_deadline')
            ->whereDate(
                'global_deadline',
                $today->copy()->addDay()->startOfDay()
            )
            ->get();

        if ($globalSettings->isEmpty()) {
            Log::info(
                '✅ No active faculties with enabled preferences have ' .
                'global deadlines in the next 24 hours.'
            );
            $this->info(
                '✅ No active faculties with enabled preferences have ' .
                'global deadlines in the next 24 hours.'
            );
            return;
        }

        foreach ($globalSettings as $setting) {
            if ($setting->faculty && $setting->faculty->user) {
                NotifyGlobalFacultyDeadlineJob::dispatch($setting->faculty);
                Log::info(
                    "✅ Global notification dispatched for faculty ID: " .
                    "{$setting->faculty->id}"
                );
            }
        }

        $this->info(
            '✅ Global faculty deadline notifications dispatched successfully.'
        );
    }
}
