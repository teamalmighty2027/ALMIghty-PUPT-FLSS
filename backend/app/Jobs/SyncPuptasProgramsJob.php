<?php

namespace App\Jobs;

use App\Models\Program;
use App\Services\AuditLogger;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use \Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class SyncPuptasProgramsJob implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * The number of times the job may be attempted.
     *
     * @var int
     */
    public $tries = 3;

    /**
     * The maximum number of unhandled exceptions to allow before failing.
     *
     * @var int
     */
    public $maxExceptions = 3;

    /**
     * The number of seconds to wait before retrying the job.
     * Exponential backoff: 120s, 600s
     *
     * @var array
     */
     public $backoff = [120, 600];

    /**
     * Get the unique ID for the job.
     * Ensures only one PUPTAS sync job can run at a time.
     *
     * @return string
     */
    public function uniqueId(): string
    {
        return static::class;
    }

    /**
     * The number of seconds the unique job lock should be held.
     * Set to 1 hour to prevent duplicate runs within this window.
     *
     * @var int
     */
    public $uniqueFor = 3600;

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        try {
            $this->executeSyncWithLock();
        } catch (\Throwable $e) {
            Log::error('PUPTAS sync job failed: ' . $e->getMessage(), [
                'exception' => $e
            ]);
            
            throw $e;
        }
    }

    /**
     * Execute the actual sync logic.
     */
    private function executeSyncWithLock(): void
    {
        $baseUrl = config('services.puptas.base_url');
        $clientId = config('services.puptas.client_id');
        $clientSecret = config('services.puptas.client_secret');

        if (! $baseUrl || ! $clientId || ! $clientSecret) {
            Log::critical('PUPTAS sync aborted: missing configuration.', [
                'base_url_set' => (bool) $baseUrl,
                'client_id_set' => (bool) $clientId,
                'client_secret_set' => (bool) $clientSecret,
            ]);

            AuditLogger::log(
                action: 'update',
                description: 'PUPTAS sync failed: missing configuration',
                model: 'Program',
                modelId: null,
                metadata: [
                    'base_url_set' => (bool) $baseUrl,
                    'client_id_set' => (bool) $clientId,
                    'client_secret_set' => (bool) $clientSecret,
                ]
            );

            $this->fail(new RuntimeException('PUPTAS configuration is missing.'));
            return;
        }

        try {
            $token = $this->fetchOAuthToken($baseUrl, $clientId, $clientSecret);
        } catch (\Throwable $error) {
            Log::error('PUPTAS OAuth token fetch failed.', [
                'message' => $error->getMessage(),
            ]);

            AuditLogger::log(
                action: 'update',
                description: 'PUPTAS sync failed: OAuth error',
                model: 'Program',
                modelId: null,
                metadata: ['error' => $error->getMessage()]
            );

            throw $error;
        }

        $url = rtrim($baseUrl, '/') . '/api/v1/programs';

        try {
            $response = Http::withToken($token)
                ->acceptJson()
                ->timeout(30)
                ->get($url);
        } catch (ConnectionException $error) {
            Log::error('PUPTAS sync connection error.', [
                'message' => $error->getMessage(),
            ]);

            AuditLogger::log(
                action: 'update',
                description: 'PUPTAS sync failed: connection error',
                model: 'Program',
                modelId: null,
                metadata: [
                    'error' => $error->getMessage(),
                ]
            );

            throw $error;
        }

        Log::info('PUPTAS sync response received.', [
            'status' => $response->status(),
        ]);

        if ($response->status() === 401) {
            Log::critical('PUPTAS sync unauthorized.', [
                'status' => $response->status(),
                'body' => $response->json(),
            ]);

            AuditLogger::log(
                action: 'update',
                description: 'PUPTAS sync failed: unauthorized',
                model: 'Program',
                modelId: null,
                metadata: [
                    'status' => $response->status(),
                    'body' => $response->json(),
                ]
            );

            $this->fail(new RuntimeException('PUPTAS API unauthorized.'));
            return;
        }

        if ($response->status() === 429) {
            Log::warning('PUPTAS sync rate limited.', [
                'status' => $response->status(),
                'retry_after' => $response->header('Retry-After'),
            ]);

            AuditLogger::log(
                action: 'update',
                description: 'PUPTAS sync failed: rate limited',
                model: 'Program',
                modelId: null,
                metadata: [
                    'status' => $response->status(),
                    'retry_after' => $response->header('Retry-After'),
                ]
            );

            throw new RuntimeException('PUPTAS API rate limited.');
        }

        if (! $response->successful()) {
            Log::error('PUPTAS sync failed.', [
                'status' => $response->status(),
                'body' => $response->json(),
            ]);

            AuditLogger::log(
                action: 'update',
                description: 'PUPTAS sync failed: request error',
                model: 'Program',
                modelId: null,
                metadata: [
                    'status' => $response->status(),
                    'body' => $response->json(),
                ]
            );

            throw new RuntimeException('PUPTAS API request failed.');
        }

        Log::info('PUPTAS response: ', $response->json());

        $payload = $response->json();
        $programs = $this->extractPrograms($payload);

        // Guard against empty program list: proceed only if confirmed intentional
        if (empty($programs)) {
            $hasConfirmation = isset($payload['total_count']) 
                && $payload['total_count'] === 0;

            if (! $hasConfirmation) {
                Log::critical('PUPTAS sync aborted: empty list no confirmation.', [
                    'payload_keys' => array_keys($payload),
                    'total_count' => $payload['total_count'] ?? null,
                ]);

                AuditLogger::log(
                    action: 'update',
                    description: 'PUPTAS sync failed: empty list no confirmation',
                    model: 'Program',
                    modelId: null,
                    metadata: [
                        'payload_keys' => array_keys($payload),
                        'total_count' => $payload['total_count'] ?? null,
                        'error' => 'Cannot confirm if zero programs is intentional',
                    ]
                );

                $this->fail(new RuntimeException('PUPTAS API returned empty list.'));
                return;
            }

            Log::info('PUPTAS sync confirmed zero programs from API.', [
                'total_count' => $payload['total_count'],
            ]);
        }

        $now = now();
        $seenCodes = [];
        $createdCount = 0;
        $updatedCount = 0;
        $deactivatedCount = 0;
        $skippedCount = 0;

        DB::transaction(function () use (
            $programs,
            $now,
            &$seenCodes,
            &$createdCount,
            &$updatedCount,
            &$deactivatedCount,
            &$skippedCount
        ) {
            foreach ($programs as $programData) {
                $rawCode = trim((string) (
                    $programData['program_code'] ?? $programData['code'] ?? ''
                ));

                if ($rawCode === '') {
                    $skippedCount++;
                    continue;
                }

                $normalizedCode = $this->normalizeProgramCode($rawCode);

                if ($normalizedCode !== $rawCode) {
                    Log::info('PUPTAS program_code truncated.', [
                        'original_code' => $rawCode,
                        'truncated_code' => $normalizedCode,
                    ]);
                }

                $incomingTitle = trim((string) (
                    $programData['program_title']
                    ?? $programData['program_name']
                    ?? $programData['name']
                    ?? $programData['title']
                    ?? ''
                ));

                $incomingDepartment = trim((string) (
                    $programData['department'] ?? ''
                ));

                $programInfo = $programData['program_info']
                    ?? $programData['info']
                    ?? ($incomingDepartment !== '' ? $incomingDepartment : null);

                $numberOfYears = $programData['number_of_years'] 
                    ?? $programData['years'] 
                    ?? 1;

                $existing = Program::where('program_code', $normalizedCode)
                    ->first();

                if (! $existing && $incomingTitle !== '') {
                    $existing = Program::whereRaw(
                        'LOWER(program_title) LIKE ?', 
                        ['%' . strtolower($incomingTitle) . '%']
                    )->first();

                    if ($existing) {
                        Log::info('PUPTAS title-based match used.', [
                            'incoming_title' => $incomingTitle,
                            'matched_program_id' => $existing->program_id,
                            'matched_program_code' => $existing->program_code,
                            'incoming_code' => $rawCode,
                            'normalized_code' => $normalizedCode,
                        ]);
                    }
                }

                $programTitle = $incomingTitle !== '' 
                    ? $incomingTitle 
                    : ($existing?->program_title ?? $normalizedCode);

                $programInfo = $programInfo 
                    ?? $existing?->program_info 
                    ?? $programTitle;

                $numberOfYears = $numberOfYears 
                    ?: ($existing?->number_of_years ?? 1);

                if ($existing) {
                    $seenCodes[] = $existing->program_code;
                    $existing->update([
                        'program_title' => $incomingTitle !== '' 
                            ? $programTitle 
                            : $existing->program_title,
                        'program_info' => $programInfo,
                        'number_of_years' => $numberOfYears,
                        'status' => 'Active',
                        'last_synced_at' => $now,
                    ]);
                    $updatedCount++;
                    continue;
                }

                $seenCodes[] = $normalizedCode;
                Program::create([
                    'program_code' => $normalizedCode,
                    'program_title' => $programTitle,
                    'program_info' => $programInfo,
                    'number_of_years' => $numberOfYears,
                    'status' => 'Active',
                    'last_synced_at' => $now,
                ]);
                $createdCount++;
            }

            if (count($seenCodes) > 0) {
                $deactivatedCount = Program::whereNotIn('program_code', $seenCodes)
                    ->where('status', '!=', 'Inactive')
                    ->update(['status' => 'Inactive']);
            }
        });

        AuditLogger::log(
            action: 'update',
            description: 'Synced programs from PUPTAS',
            model: 'Program',
            modelId: null,
            metadata: [
                'created' => $createdCount,
                'updated' => $updatedCount,
                'deactivated' => $deactivatedCount,
                'skipped' => $skippedCount,
                'synced_at' => $now->toDateTimeString(),
            ]
        );

        Log::info('PUPTAS program sync completed.', [
            'created' => $createdCount,
            'updated' => $updatedCount,
            'deactivated' => $deactivatedCount,
            'skipped' => $skippedCount,
        ]);
    }

    /**
     * Normalize the PUPTAS API response into a list of programs.
     *
     * @param mixed $payload
     * @return array
     */
    private function extractPrograms($payload): array
    {
        if (is_array($payload) && array_is_list($payload)) {
            return $payload;
        }

        if (is_array($payload)) {
            foreach (['programs', 'data', 'items'] as $key) {
                if (isset($payload[$key]) && is_array($payload[$key])) {
                    return $payload[$key];
                }
            }
        }

        return [];
    }

    /**
     * Helper function that trims the program code
     * @param string $code
     */
    private function normalizeProgramCode(string $code): string
    {
        $trimmed = trim($code);

        if (strlen($trimmed) <= 10) {
            return $trimmed;
        }

        return substr($trimmed, 0, 10);
    }

    /**
     * Fetch an OAuth 2.0 bearer token from PUPTAS using
     * Client Credentials grant. Token is cached for 23 hours
     * to stay safely under the 50 req/day rate limit.
     * 
     * @param string $baseUrl
     * @param string $clientId
     * @param string $clientSecret
     * @return string
     */
    private function fetchOAuthToken(
        string $baseUrl,
        string $clientId,
        string $clientSecret
    ): string {
        $cacheKey = 'puptas_oauth_token';

        return Cache::remember($cacheKey, now()->addHours(23), function ()
            use ($baseUrl, $clientId, $clientSecret)
        {
            $tokenUrl = rtrim($baseUrl, '/') . '/oauth/token';

            $response = Http::asForm()->post($tokenUrl, [
                'grant_type' => 'client_credentials',
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'scope' => 'program-read',
            ]);

            if (! $response->successful()) {
                throw new RuntimeException(
                    'PUPTAS OAuth token request failed: ' . $response->status()
                );
            }

            $token = $response->json('access_token');

            if (! $token) {
                throw new RuntimeException(
                    'PUPTAS OAuth response missing access_token.'
                );
            }

            return $token;
        });
    }
}

