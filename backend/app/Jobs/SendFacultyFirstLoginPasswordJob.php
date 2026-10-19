<?php

namespace App\Jobs;

use App\Models\EmailDispatchLog;
use Carbon\Carbon;
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
    protected $dispatchedAt;
    protected $dispatchLogId;

    public $tries = 3;
    public $timeout = 60;

    /**
     * Create a new job instance.
     *
     * @param  $faculty  The faculty user instance
     * @param  string  $password  The generated password
     * @param  int|null  $dispatchLogId  Optional pre-created dispatch log ID
     * @return void
     */
    public function __construct($faculty, $password, $dispatchLogId = null)
    {
        $this->faculty      = $faculty;
        $this->password     = $password;
        $this->dispatchedAt = Carbon::now();

        if ($dispatchLogId) {
            $this->dispatchLogId = $dispatchLogId;
        } else {
            $facObj = (object) $faculty;
            $email = $facObj->email ?? 'No email on file';
            $name = trim(
                ($facObj->first_name ?? '') . ' ' .
                ($facObj->last_name ?? '')
            );

            $log = EmailDispatchLog::create([
                'faculty_id'      => $facObj->id ?? null,
                'recipient_email' => $email,
                'recipient_name'  => $name ?: null,
                'purpose'         => 'first_login_password',
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
        // Convert array to object if needed for consistency
        $faculty = (object) $this->faculty;
        $email   = $faculty->email ?? null;
        $name    = trim(
            ($faculty->first_name ?? '') . ' ' .
            ($faculty->last_name ?? '')
        );

        if (!$email) {
            Log::warning(
                "Skipping faculty first login password email: missing email"
            );

            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'        => 'failed',
                    'error_message' => 'Skipped: missing email address.',
                    'processed_at'  => Carbon::now(),
                ]);
            }

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

            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'          => 'sent',
                    'recipient_email' => $email,
                    'recipient_name'  => $name ?: null,
                    'processed_at'    => Carbon::now(),
                ]);
            } else {
                EmailDispatchLog::create([
                    'faculty_id'      => $faculty->id ?? null,
                    'recipient_email' => $email,
                    'recipient_name'  => $name ?: null,
                    'purpose'         => 'first_login_password',
                    'status'          => 'sent',
                    'dispatched_at'   => $this->dispatchedAt,
                    'processed_at'    => Carbon::now(),
                ]);
            }

            Log::info(
                "Faculty first login password email sent to: " . $email
            );
        } catch (\Exception $e) {
            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'          => 'failed',
                    'recipient_email' => $email,
                    'recipient_name'  => $name ?: null,
                    'error_message'   => $e->getMessage(),
                    'processed_at'    => Carbon::now(),
                ]);
            } else {
                EmailDispatchLog::create([
                    'faculty_id'      => $faculty->id ?? null,
                    'recipient_email' => $email,
                    'recipient_name'  => $name ?: null,
                    'purpose'         => 'first_login_password',
                    'status'          => 'failed',
                    'error_message'   => $e->getMessage(),
                    'dispatched_at'   => $this->dispatchedAt,
                    'processed_at'    => Carbon::now(),
                ]);
            }

            Log::error(
                "Failed to send faculty first login password email to: " .
                $email . ". Error: " . $e->getMessage()
            );

            $this->fail($e);
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
        if ($this->dispatchLogId) {
            EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                'status'        => 'failed',
                'error_message' => $exception->getMessage(),
                'processed_at'  => Carbon::now(),
            ]);
        }

        $code = is_object($this->faculty)
            ? ($this->faculty->code ?? 'Unknown')
            : ($this->faculty['code'] ?? 'Unknown');

        Log::error('Failed to send faculty first login password email', [
            'faculty_code' => $code,
            'error'        => $exception->getMessage(),
        ]);
    }
}
