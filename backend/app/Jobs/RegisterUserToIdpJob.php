<?php

namespace App\Jobs;

use App\Models\User;
use Exception;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class RegisterUserToIdpJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * The user and their plain-text password for registration.
     */
    protected $user;
    protected $password;

    /**
     * Job execution configuration.
     */
    public $tries = 5;
    public $timeout = 60;

    /**
     * The number of seconds to wait before retrying the job.
     * 
     * @return int
     */
    public function backoff()
    {
        return 300; // 5 minutes
    }

    /**
     * Create a new job instance.
     * 
     * @param  User  $user
     * @param  string  $password
     * @return void
     */
    public function __construct(User $user, string $password)
    {
        $this->user = $user;
        $this->password = $password;
    }

    /**
     * Execute the job.
     * 
     * @return void
     */
    public function handle()
    {
        $baseUrl = config('services.idp.base_url');
        $apiKey = config('services.idp.api_key');

        if (!$baseUrl || !$apiKey) {
            throw new Exception('IDP configuration missing (base_url or api_key)');
        }

        $payload = [
            'account_type' => 'faculty',
            'email'        => $this->user->email,
            'first_name'   => $this->user->first_name,
            'last_name'    => $this->user->last_name,
            'middle_name'  => $this->user->middle_name ?? '',
            'name_suffix'  => $this->user->suffix_name ?? '',
            'password'     => $this->password,
            'status'       => 'active',
        ];

        $response = Http::withoutVerifying()
            ->withHeaders(['X-API-KEY' => $apiKey])
            ->asJson()
            ->post(rtrim($baseUrl, '/') . '/api/v1/users', $payload);

        if (!$response->successful()) {
            throw new Exception("IDP User Registration failed with status " . $response->status() . ": " . $response->body());
        }

        Log::info("User successfully registered to IDP", [
            'user_id' => $this->user->id,
            'email'   => $this->user->email
        ]);
    }

    /**
     * Handle a job failure.
     * 
     * @param  \Exception  $exception
     * @return void
     */
    public function failed(Exception $exception)
    {
        Log::error('Failed to register user to IDP after all attempts', [
            'user_id' => $this->user->id,
            'email'   => $this->user->email,
            'error'   => $exception->getMessage(),
        ]);
    }
}
