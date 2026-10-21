<?php

namespace App\Jobs;

use App\Models\User;
use App\Services\AuditLogger;
use App\Services\SystemNoticeService;
use Exception;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class UpdateUserEmailIdpJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * User instance being updated.
     */
    protected User $user;

    /**
     * IDP user UUID.
     */
    protected string $uuid;

    /**
     * The new email address.
     */
    protected string $newEmail;

    /**
     * The previous email address if known.
     */
    protected ?string $oldEmail;

    /**
     * Captured IDP access token.
     */
    protected ?string $token;

    /**
     * Job execution configuration.
     */
    public $tries = 5;
    public $timeout = 60;

    /**
     * Seconds to wait before retrying the job (5 minutes).
     *
     * @return int
     */
    public function backoff(): int
    {
        return 300;
    }

    /**
     * Create a new job instance.
     *
     * @param User $user
     * @param string $uuid
     * @param string $newEmail
     * @param string|null $oldEmail
     * @param string|null $token
     * @return void
     */
    public function __construct(
        User $user,
        string $uuid,
        string $newEmail,
        ?string $oldEmail = null,
        ?string $token = null
    ) {
        $this->user = $user;
        $this->uuid = $uuid;
        $this->newEmail = $newEmail;
        $this->oldEmail = $oldEmail;
        $this->token = $token;
    }

    /**
     * Execute the job to patch email in IDP.
     *
     * @return void
     * @throws Exception
     */
    public function handle(): void
    {
        $baseUrl = config('services.idp.base_url');

        $endpoint = rtrim($baseUrl, '/') .
            "/api/v1/admin/users/{$this->uuid}/email";

        $requestHttp = Http::withoutVerifying()
            ->asJson()
            ->timeout(15);

        // Apply service API key if configured
        $apiKey = config('services.idp.api_key');

        if (!empty($apiKey)) {
            $requestHttp = $requestHttp->withHeaders([
                'X-API-KEY' => $apiKey,
            ]);
        }

        // Apply access token from dispatch or config fallback
        $token = $this->token
            ?? config('services.idp.access_token')
            ?? env('IDP_ACCESS_TOKEN');

        if (!empty($token)) {
            $requestHttp = $requestHttp
                ->withToken($token)
                ->withHeaders([
                    'Cookie' => "access_token={$token}",
                ]);

            $domain = parse_url($baseUrl, PHP_URL_HOST);

            if ($domain) {
                $requestHttp = $requestHttp->withCookies(
                    ['access_token' => $token],
                    $domain
                );
            }
        }

        Log::info(
            "Attempting IDP email sync for user {$this->user->id}",
            [
                'user_id'  => $this->user->id,
                'uuid'     => $this->uuid,
                'email'    => $this->newEmail,
                'attempt'  => $this->attempts(),
                'endpoint' => $endpoint,
            ]
        );

        $response = $requestHttp->patch($endpoint, [
            'email' => $this->newEmail,
        ]);

        if (!$response->successful()) {
            $message = "IDP email sync failed with status " .
                $response->status() . ": " . $response->body();

            Log::error(
                $message,
                [
                    'user_id' => $this->user->id,
                    'uuid'    => $this->uuid,
                    'attempt' => $this->attempts(),
                ]
            );

            throw new Exception($message);
        }

        Log::info(
            "User {$this->user->id} email synced to IDP successfully",
            [
                'user_id' => $this->user->id,
                'uuid'    => $this->uuid,
                'email'   => $this->newEmail,
            ]
        );

        AuditLogger::log(
            action: 'update',
            description: "Updated IDP email for user {$this->user->id} " .
                "to {$this->newEmail}",
            model: 'User',
            modelId: $this->user->id,
            oldValues: $this->oldEmail ? ['email' => $this->oldEmail] : null,
            newValues: ['email' => $this->newEmail],
            metadata: [
                'idp_uuid'    => $this->uuid,
                'endpoint'    => $endpoint,
                'status_code' => $response->status(),
            ]
        );
    }

    /**
     * Handle job failure when all attempts are exhausted.
     *
     * @param Throwable $exception
     * @return void
     */
    public function failed(Throwable $exception): void
    {
        Log::error(
            "IDP email sync permanently failed for user {$this->user->id}",
            [
                'user_id' => $this->user->id,
                'uuid'    => $this->uuid,
                'email'   => $this->newEmail,
                'error'   => $exception->getMessage(),
            ]
        );

        AuditLogger::log(
            action: 'update',
            description: "Failed to update IDP email for user " .
                "{$this->user->id} after all retry attempts",
            model: 'User',
            modelId: $this->user->id,
            metadata: [
                'idp_uuid' => $this->uuid,
                'email'    => $this->newEmail,
                'error'    => $exception->getMessage(),
            ]
        );

        SystemNoticeService::create(
            'idp_sync',
            'error',
            'backend',
            'IDP Email Sync Failed',
            "Failed to sync email for {$this->user->email} " .
                "(UUID: {$this->uuid}) after {$this->tries} attempts.",
            [
                'user_id' => $this->user->id,
                'uuid'    => $this->uuid,
                'email'   => $this->newEmail,
                'error'   => $exception->getMessage(),
            ],
            $this->user->id
        );
    }
}
