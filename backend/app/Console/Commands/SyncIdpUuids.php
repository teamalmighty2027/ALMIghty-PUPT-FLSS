<?php

namespace App\Console\Commands;

use App\Models\Faculty;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class SyncIdpUuids extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'sync:idp-uuids
                            {--token= : The IDP admin access token}
                            {--limit=100 : Users per API page}
                            {--dry-run : Simulate without writing to DB}
                            {--export-sql= : Export SQL updates to file}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Syncs faculty email with IDP user UUIDs';

    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle()
    {
        $token = $this->option('token');
        $limit = (int) $this->option('limit');
        $dryRun = $this->option('dry-run');
        $exportSql = $this->option('export-sql');

        // Check if token is provided
        if (empty($token)) {
            $this->error('The --token option is required.');
            return 1;
        }

        // Get IDP base URL
        $baseUrl = config('services.idp.base_url') 
            ?? 'https://identity-provider.isaxbsit2027.com';

        $this->info("IDP Base URL: {$baseUrl}");

        // Fetch faculties missing their IDP user UUID
        $faculties = Faculty::join('users', 'faculty.user_id', '=', 'users.id')
            ->select(
                'faculty.id as faculty_id',
                'users.email',
                'faculty.idp_user_id'
            )
            ->get();

        $emailsToSync = [];

        foreach ($faculties as $fac) {
            if (empty($fac->idp_user_id)) {
                $emailsToSync[strtolower($fac->email)] = $fac;
            }
        }

        // Check if there are faculties to sync
        if (empty($emailsToSync)) {
            $this->info('All faculties already have IDP user IDs (UUIDs).');
            return 0;
        }

        $this->info(
            'Number of faculties missing UUID: ' . count($emailsToSync)
        );

        $page = 1;
        $matched = 0;
        $sqlUpdates = [];

        $this->info('Fetching users from IDP...');

        // Loop pagination to get all users from IDP admin API
        while (true) {
            $this->info("Fetching page {$page} (limit: {$limit})...");

            $domain = parse_url($baseUrl, PHP_URL_HOST)
                ?? 'identity-provider.isaxbsit2027.com';

            // Fetch from API with access_token cookie as required
            $response = Http::withoutVerifying()
                ->withCookies(['access_token' => $token], $domain)
                ->get(rtrim($baseUrl, '/') . "/api/v1/admin/users", [
                    'page' => $page,
                    'limit' => $limit,
                ]);

            // Check if request succeeded
            if (!$response->successful()) {
                $this->error(
                    "Failed to fetch page {$page}. Status: " .
                    $response->status()
                );
                $this->error("Body: " . $response->body());
                break;
            }

            $data = $response->json();
            $this->info("Response structure: " . json_encode(array_slice($data, 0, 2)));

            $usersList = [];

            // Extract user list from pagination wrapper if present
            if (isset($data['data']) && is_array($data['data'])) {
                $usersList = $data['data'];
            } elseif (isset($data['users']) && is_array($data['users'])) {
                $usersList = $data['users'];
            } elseif (is_array($data)) {
                $usersList = $data;
            }

            // Exit if empty user list
            if (empty($usersList)) {
                $this->info("No users returned on page {$page}. Exiting loop.");
                break;
            }

            // Sync matched users
            foreach ($usersList as $idpUser) {
                if (!isset($idpUser['email']) || !isset($idpUser['id'])) {
                    continue;
                }

                $idpEmail = strtolower($idpUser['email']);
                $idpId = $idpUser['id'];

                if (isset($emailsToSync[$idpEmail])) {
                    $fac = $emailsToSync[$idpEmail];
                    $matched++;

                    $this->line("Match: {$idpEmail} -> {$idpId}");

                    // Construct SQL update statement
                    if ($exportSql) {
                        $sqlUpdates[] = "UPDATE faculty SET idp_user_id = " .
                            "'{$idpId}' WHERE id = {$fac->faculty_id};";
                    }

                    // Perform database update
                    if (!$dryRun) {
                        Faculty::where('id', $fac->faculty_id)->update([
                            'idp_user_id' => $idpId,
                        ]);
                    }
                }
            }

            // Break if we returned fewer users than the limit
            if (count($usersList) < $limit) {
                break;
            }

            $page++;
        }

        $this->info("Sync completed.");
        $this->info("Matched and updated: {$matched} user(s).");

        // Write SQL updates if requested
        if ($exportSql && !empty($sqlUpdates)) {
            file_put_contents($exportSql, implode("\n", $sqlUpdates) . "\n");
            $this->info("SQL script exported to {$exportSql}");
        }

        return 0;
    }
}
