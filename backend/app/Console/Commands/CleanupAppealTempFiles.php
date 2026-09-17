<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class CleanupAppealTempFiles extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'appeals:cleanup-temp';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Clean up temporary appeal prescan files older than 24 hours';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $files = Storage::disk('public')->files('tmp/appeal-prescan');
        $now = time();
        $count = 0;

        foreach ($files as $file) {
            $lastModified = Storage::disk('public')->lastModified($file);

            // Delete files older than 24 hours (86400 seconds)
            if (($now - $lastModified) > 86400) {
                Storage::disk('public')->delete($file);
                $count++;
            }
        }

        $this->info("Cleaned up {$count} temporary appeal file(s).");

        return Command::SUCCESS;
    }
}
