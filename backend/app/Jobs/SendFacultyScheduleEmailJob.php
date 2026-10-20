<?php

namespace App\Jobs;

use App\Models\EmailDispatchLog;
use App\Services\EmailValidationService;
use Carbon\Carbon;
use Exception;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;

class SendFacultyScheduleEmailJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $faculty;
    protected $dispatchedAt;
    protected $dispatchLogId;

    public $tries = 3;
    public $timeout = 60;

    /**
     * Create a new job instance.
     *
     * @param  $faculty  The faculty instance passed from the controller
     * @param  int|null  $dispatchLogId  Optional pre-created dispatch log ID
     * @return void
     */
    public function __construct($faculty, $dispatchLogId = null)
    {
        $this->faculty      = $faculty;
        $this->dispatchedAt = Carbon::now();

        if ($dispatchLogId) {
            $this->dispatchLogId = $dispatchLogId;
        } else {
            $facultyModel = $faculty;

            if (is_numeric($faculty)) {
                $facultyModel = \App\Models\Faculty::with('user')
                    ->find($faculty);
            } else if (
                $faculty instanceof \App\Models\Faculty &&
                !$faculty->relationLoaded('user')
            ) {
                $facultyModel = \App\Models\Faculty::with('user')
                    ->find($faculty->id);
            }

            $user = $facultyModel?->user ?? ($faculty?->user ?? null);
            $email = $user?->email ?? 'No email on file';
            $name = $user?->formatted_name
                ?? ($user?->name ?? 'Faculty Member');
            $facId = is_numeric($faculty) ? $faculty : ($faculty->id ?? null);

            $log = EmailDispatchLog::create([
                'faculty_id'      => $facId,
                'recipient_email' => $email,
                'recipient_name'  => $name,
                'purpose'         => 'schedule_published',
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
        $faculty = $this->faculty;
        $needsReload = !($faculty instanceof \App\Models\Faculty)
            || !$faculty->relationLoaded('user');

        if ($needsReload) {
            $facultyId = is_numeric($faculty)
                ? $faculty
                : ($faculty->id ?? null);

            if ($facultyId) {
                $faculty = \App\Models\Faculty::with('user')->find($facultyId);
            }
        }

        $user = $faculty?->user ?? ($this->faculty->user ?? null);
        $email = $user?->email ?? null;
        $name = $user?->formatted_name ?? ($user?->name ?? 'Faculty Member');

        if (!$email) {
            Log::warning(
                "Skipping schedule email: missing email address for faculty ID "
                . ($this->faculty->id ?? 'unknown')
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

        $validation = EmailValidationService::validate($email);

        if (!$validation['valid']) {
            Log::warning(
                "Skipping schedule email: invalid email for faculty ID " .
                ($this->faculty->id ?? 'unknown') . " - {$validation['reason']}"
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

        $dataSchedule = [
            'faculty_name' => $name,
            'email'        => $email,
        ];

        try {
            Mail::send(
                'emails.load_schedule_published',
                $dataSchedule,
                function ($message) use ($email) {
                    $message->to($email)
                        ->subject(
                            'Your Official Load & Schedule is now available'
                        );
                }
            );

            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'          => 'sent',
                    'recipient_email' => $email,
                    'recipient_name'  => $name,
                    'processed_at'    => Carbon::now(),
                ]);
            } else {
                EmailDispatchLog::create([
                    'faculty_id'      => $this->faculty->id ?? null,
                    'recipient_email' => $email,
                    'recipient_name'  => $name,
                    'purpose'         => 'schedule_published',
                    'status'          => 'sent',
                    'dispatched_at'   => $this->dispatchedAt,
                    'processed_at'    => Carbon::now(),
                ]);
            }

            Log::info(
                "Official load & schedule email sent to: " . $email
            );
        } catch (\Exception $e) {
            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'          => 'failed',
                    'recipient_email' => $email,
                    'recipient_name'  => $name,
                    'error_message'   => $e->getMessage(),
                    'processed_at'    => Carbon::now(),
                ]);
            } else {
                EmailDispatchLog::create([
                    'faculty_id'      => $this->faculty->id ?? null,
                    'recipient_email' => $email,
                    'recipient_name'  => $name,
                    'purpose'         => 'schedule_published',
                    'status'          => 'failed',
                    'error_message'   => $e->getMessage(),
                    'dispatched_at'   => $this->dispatchedAt,
                    'processed_at'    => Carbon::now(),
                ]);
            }

            Log::error(
                "Failed to send schedule email to faculty " . $email .
                ": " . $e->getMessage()
            );

            $this->fail($e);
        }
    }

    /**
     * Handle job failure.
     *
     * @param  Exception  $exception
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

        $email = $this->faculty->user->email ?? 'Unknown Email';
        Log::error(
            'SendFacultyScheduleEmailJob failed for faculty ' . $email .
            ': ' . $exception->getMessage()
        );
    }
}