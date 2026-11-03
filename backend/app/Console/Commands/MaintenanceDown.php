<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class MaintenanceDown extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'flss:down
                            {--message= : Explanation for maintenance}
                            {--retry=3600 : Number of seconds before retry}
                            {--secret= : Secret bypass phrase for admins}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description =
        'Activates PUPT-FLSS downtime returning 503 for all endpoints.';

    /**
     * Executes the downtime activation command.
     *
     * @return int
     */
    public function handle()
    {
        $this->info('Activating PUPT-FLSS downtime mode...');

        $params = [
            '--render' => 'errors.503',
            '--status' => 503,
            '--retry' => (int) $this->option('retry'),
        ];

        $secret = $this->option('secret');

        if ($secret) {
            $params['--secret'] = $secret;
        }

        // Trigger Laravel maintenance mode
        $exitCode = $this->call('down', $params);

        if ($exitCode === 0) {
            $this->newLine();
            $this->info('==============================================');
            $this->info('  PUPT-FLSS is now in DOWNTIME MODE (503)');
            $this->info('==============================================');
            $this->line('All incoming API and web requests will return:');
            $this->line('  - Web Routes: Branded 503 Maintenance Page');
            $this->line('  - API/JSON: HTTP 503 Service Unavailable');

            if ($secret) {
                $this->newLine();
                $this->warn("Admin bypass secret enabled: {$secret}");
                $this->line("Bypass URL: /{$secret}");
            }

            $this->newLine();
            return 0;
        }

        $this->error('Failed to activate maintenance mode.');
        return $exitCode;
    }
}
