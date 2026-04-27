<?php

namespace App\Console;

use App\Console\Commands\DeployBackend;
use App\Jobs\SyncPuptasProgramsJob;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;
use Illuminate\Support\Facades\DB; 
use Carbon\Carbon;

class Kernel extends ConsoleKernel
{
    /**
     * Command to run when deploying for production
     */
    protected $commands = [
        DeployBackend::class,
    ];

    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        // Your existing preference deadline check
        $schedule->command('preferences:check-deadline')
            ->dailyAt('00:01')
            ->timezone('Asia/Manila');

        // Your existing sync job
        $schedule->job(new SyncPuptasProgramsJob())
            ->dailyAt('02:00')
            ->timezone('Asia/Manila');

        // ---> NEW: Auto-disable appeals when the deadline passes <---
        $schedule->call(function () {
            DB::table('faculty')
                ->where('is_appeal_enabled', 1)
                ->whereNotNull('appeal_end_date')
                ->where('appeal_end_date', '<', Carbon::now('Asia/Manila')) // Respecting your timezone
                ->update([
                    'is_appeal_enabled' => 0,
                    'appeal_start_date' => null,
                    'appeal_end_date'   => null,
                    'has_appeal_request'=> 0, // Clears the orange badge too, just in case
                ]);
        })->everyMinute();
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__ . '/Commands');

        require base_path('routes/console.php');
    }
}