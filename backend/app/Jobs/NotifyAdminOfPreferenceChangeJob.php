<?php

namespace App\Jobs;

use App\Models\Faculty;
use App\Models\User;
use App\Models\EmailDispatchLog;
use App\Services\EmailValidationService;
use Carbon\Carbon;
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
    protected $dispatchedAt;
    protected $dispatchLogId;

    /**
     * Create a new job instance.
     *
     * @param  Faculty  $faculty
     * @param  User  $admin
     * @param  int|null  $dispatchLogId  Optional pre-created dispatch log ID
     * @return void
     */
    public function __construct(
        Faculty $faculty,
        User $admin,
        $dispatchLogId = null
    ) {
        $this->faculty      = $faculty;
        $this->admin        = $admin;
        $this->dispatchedAt = Carbon::now();

        if ($dispatchLogId) {
            $this->dispatchLogId = $dispatchLogId;
        } else {
            $adminEmail = $admin->email ?? 'No email on file';
            $adminName = $this->formatName(
                $admin->last_name,
                $admin->first_name,
                $admin->middle_name
            );

            $log = EmailDispatchLog::create([
                'faculty_id'      => $faculty->id ?? null,
                'recipient_email' => $adminEmail,
                'recipient_name'  => $adminName,
                'purpose'         => 'reschedule_notification',
                'status'          => 'queued',
                'dispatched_at'   => $this->dispatchedAt,
                'triggered_by'    => auth()->id(),
            ]);

            $this->dispatchLogId = $log->id;
        }
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

            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'        => 'failed',
                    'error_message' => 'Skipped: missing admin email address.',
                    'processed_at'  => Carbon::now(),
                ]);
            }

            return;
        }

        $validation = EmailValidationService::validate($adminEmail);

        if (!$validation['valid']) {
            Log::warning(
                "Skipping admin preference change email: " .
                $validation['reason']
            );

            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'        => 'failed',
                    'error_message' => $validation['reason'],
                    'processed_at'  => Carbon::now(),
                ]);
            }

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

            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'          => 'sent',
                    'recipient_email' => $adminEmail,
                    'recipient_name'  => $adminName,
                    'processed_at'    => Carbon::now(),
                ]);
            } else {
                EmailDispatchLog::create([
                    'faculty_id'      => $this->faculty->id ?? null,
                    'recipient_email' => $adminEmail,
                    'recipient_name'  => $adminName,
                    'purpose'         => 'reschedule_notification',
                    'status'          => 'sent',
                    'dispatched_at'   => $this->dispatchedAt,
                    'processed_at'    => Carbon::now(),
                ]);
            }

            Log::info(
                "Preference change request email sent to admin: " .
                $adminEmail
            );
        } catch (\Exception $e) {
            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'          => 'failed',
                    'recipient_email' => $adminEmail,
                    'recipient_name'  => $adminName,
                    'error_message'   => $e->getMessage(),
                    'processed_at'    => Carbon::now(),
                ]);
            } else {
                EmailDispatchLog::create([
                    'faculty_id'      => $this->faculty->id ?? null,
                    'recipient_email' => $adminEmail,
                    'recipient_name'  => $adminName,
                    'purpose'         => 'reschedule_notification',
                    'status'          => 'failed',
                    'error_message'   => $e->getMessage(),
                    'dispatched_at'   => $this->dispatchedAt,
                    'processed_at'    => Carbon::now(),
                ]);
            }

            Log::error(
                "Failed to send preference change email to admin: " .
                $adminEmail . ". Error: " . $e->getMessage()
            );

            $this->fail($e);
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

    /**
     * Handle a job failure.
     *
     * @param  \Exception  $exception
     * @return void
     */
    public function failed(\Exception $exception)
    {
        if ($this->dispatchLogId) {
            EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                'status'        => 'failed',
                'error_message' => $exception->getMessage(),
                'processed_at'  => Carbon::now(),
            ]);
        }
    }
}
