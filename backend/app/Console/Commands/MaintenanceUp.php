<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class MaintenanceUp extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'flss:up';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description =
        'Brings PUPT-FLSS out of downtime and restores normal operations.';

    /**
     * Executes the downtime deactivation command.
     *
     * @return int
     */
    public function handle()
    {
        $this->info('Deactivating PUPT-FLSS downtime mode...');

        // Trigger Laravel maintenance up command
        $exitCode = $this->call('up');

        if ($exitCode === 0) {
            $this->newLine();
            $this->info('==============================================');
            $this->info('  PUPT-FLSS is now LIVE');
            $this->info('==============================================');
            $this->line('All APIs, controllers, and services are online.');
            $this->newLine();
            return 0;
        }

        $this->error('Failed to bring application out of maintenance.');
        return $exitCode;
    }
}
