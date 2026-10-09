<?php

namespace App\Jobs;

use App\Models\Faculty;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class NotifyAdminOfPreferenceChangeJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $faculty;
    protected $admin;

    /**
     * Create a new job instance.
     *
     * @param  Faculty  $faculty
     * @param  User  $admin
     * @return void
     */
    public function __construct(Faculty $faculty, User $admin)
    {
        $this->faculty = $faculty;
        $this->admin = $admin;
    }

    /**
     * Execute the job.
     *
     * @return void
     */
    public function handle()
    {
        $adminEmail = $this->admin->email ?? null;

        if (!$adminEmail) {
            Log::warning(
                "Skipping admin preference change email: missing email address"
            );

            return;
        }

        $facultyName = $this->formatName(
            $this->faculty->user->last_name,
            $this->faculty->user->first_name,
            $this->faculty->user->middle_name,
            $this->faculty->user->suffix_name
        );

        $adminName = $this->formatName(
            $this->admin->last_name,
            $this->admin->first_name,
            $this->admin->middle_name
        );

        $data = [
            'faculty' => (object) [
                'last_name'   => $this->faculty->user->last_name,
                'first_name'  => $this->faculty->user->first_name,
                'middle_name' => $this->faculty->user->middle_name,
                'suffix_name' => $this->faculty->user->suffix_name,
                'email'       => $this->faculty->user->email,
            ],
            'admin' => (object) [
                'last_name'   => $this->admin->last_name,
                'first_name'  => $this->admin->first_name,
                'middle_name' => $this->admin->middle_name,
            ],
        ];

        try {
            Mail::send(
                'emails.change_request',
                $data,
                function ($message) use ($adminEmail) {
                    $message->to($adminEmail)
                        ->subject('Faculty Preference Change Request');
                }
            );

            Log::info(
                "Preference change request email sent to admin: " .
                $adminEmail
            );
        } catch (\Exception $e) {
            Log::error(
                "Failed to send preference change email to admin: " .
                $adminEmail . ". Error: " . $e->getMessage()
            );
        }
    }

    /**
     * Format a name with optional middle and suffix names.
     *
     * @param string $lastName
     * @param string $firstName
     * @param string|null $middleName
     * @param string|null $suffixName
     * @return string
     */
    private function formatName(
        $lastName,
        $firstName,
        $middleName = null,
        $suffixName = null
    ) {
        $name = "{$firstName} {$middleName} {$lastName}";

        if ($suffixName) {
            $name .= " {$suffixName}";
        }

        return trim($name);
    }
}
