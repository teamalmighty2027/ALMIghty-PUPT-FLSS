<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class PruneExpiredData extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'data:prune
        {--execute : Actually delete records; omit for dry run}
        {--audit-logs : Prune old audit log records}
        {--preferences : Prune old preference records}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Prune expired preference, and ' .
        'audit data according to retention policies';

    // Retention periods
    private const PREFERENCE_RETENTION_YEARS = 5;
    private const AUDIT_LOG_RETENTION_DAYS = 1095; // 3 years

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $isDryRun = !$this->option('execute');

        if ($isDryRun) {
            $this->warn(
                'DRY RUN: No data will be deleted. Pass --execute to apply.'
            );
        }

        $pruneAll = !$this->option('audit-logs')
            && !$this->option('preferences');

        // Check and prune preferences
        if ($pruneAll || $this->option('preferences')) {
            $this->prunePreferences($isDryRun);
        }

        // Check and prune audit logs
        if ($pruneAll || $this->option('audit-logs')) {
            $this->pruneAuditLogs($isDryRun);
        }

        $this->info('Data pruning check completed.');

        return self::SUCCESS;
    }

    /**
     * Prune preference records older than the retention period.
     */
    private function prunePreferences(bool $isDryRun): void
    {
        $cutoff = Carbon::now()->subYears(self::PREFERENCE_RETENTION_YEARS);

      try {
          // Apply db transaction
          DB::beginTransaction();

          $query = DB::table('preferences')
              ->join(
                  'active_semesters',
                  'preferences.active_semester_id',
                  '=',
                  'active_semesters.active_semester_id'
              )
              ->join(
                  'academic_years',
                  'active_semesters.academic_year_id',
                  '=',
                  'academic_years.academic_year_id'
              )
              ->where('academic_years.year_end', '<', $cutoff->year);

          $count = $query->count();
          $years = self::PREFERENCE_RETENTION_YEARS;

          $this->line(
              "Preferences eligible for pruning (older than {$years} years): " .
              "{$count} records"
          );

          if (!$isDryRun && $count > 0) {
              $deleted = $query->delete();
              $this->info("Deleted {$deleted} preference records.");
              DB::commit();
          }

      } catch (\Exception $e) {
          DB::rollBack();
          $this->error('Error: ' . $e->getMessage());
          return;
      }
    }

    /**
     * Prune audit log records older than the retention period.
     */
    private function pruneAuditLogs(bool $isDryRun): void
    {
        $cutoff = Carbon::now()->subDays(self::AUDIT_LOG_RETENTION_DAYS);

        try { 
          $query = DB::table('audit_logs')
              ->where('created_at', '<', $cutoff);

          $count = $query->count();

          $this->line(
              "Audit logs eligible for pruning (older than 3 years): " .
              "{$count} records" .
              "Remember to export archive before deletion!"
          );

          if (!$isDryRun && $count > 0 && $this->confirm(
              "Delete {$count} audit records?", false)) 
          {
              $deleted = $query->delete();
              $this->info("Deleted {$deleted} audit log records.");
              DB::commit();
          }
        } catch (\Exception $e) {
            DB::rollBack();
            $this->error('Error: ' . $e->getMessage());
            return;
        }
    }
}
