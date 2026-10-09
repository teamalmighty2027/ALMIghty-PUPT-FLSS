<?php

namespace App\Jobs;

use Exception;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendFacultyFirstLoginPasswordJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $faculty;
    protected $password;

    public $tries = 3;
    public $timeout = 60;

    /**
     * Create a new job instance.
     *
     * @param  $faculty  The faculty user instance
     * @param  string  $password  The generated password
     * @return void
     */
    public function __construct($faculty, $password)
    {
        $this->faculty  = $faculty;
        $this->password = $password;
    }

    /**
     * Execute the job.
     *
     * @return void
     */
    public function handle()
    {
        // Convert array to object if needed for consistency
        $faculty = (object) $this->faculty;
        $email   = $faculty->email ?? null;

        if (!$email) {
            Log::warning(
                "Skipping faculty first login password email: missing email"
            );

            return;
        }

        $data = [
            'first_name' => $faculty->first_name ?? 'Faculty',
            'last_name'  => $faculty->last_name ?? 'Member',
            'password'   => $this->password,
            'login_url'  => $this->loginUrl ?? url('/login'),
        ];

        try {
            Mail::send(
                'emails.faculty_first_login_password',
                $data,
                function ($message) use ($email) {
                    $message->to($email)
                        ->subject('Your PUPT FLSS Account Password');
                }
            );

            Log::info(
                "Faculty first login password email sent to: " . $email
            );
        } catch (\Exception $e) {
            Log::error(
                "Failed to send faculty first login password email to: " .
                $email . ". Error: " . $e->getMessage()
            );
        }
    }

    /**
     * Handle a job failure.
     *
     * @param  \Exception  $exception
     * @return void
     */
    public function failed(Exception $exception)
    {
        $code = is_object($this->faculty)
            ? ($this->faculty->code ?? 'Unknown')
            : ($this->faculty['code'] ?? 'Unknown');

        Log::error('Failed to send faculty first login password email', [
            'faculty_code' => $code,
            'error'        => $exception->getMessage(),
        ]);
    }
}
