<?php

namespace App\Jobs;

use App\Models\Faculty;
use App\Models\EmailDispatchLog;
use App\Services\EmailValidationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

class NotifyFacultyDeadlineSingleJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $faculty;
    protected $dispatchedAt;
    protected $dispatchLogId;

    /**
     * Create a new job instance.
     *
     * @param Faculty $faculty
     * @param int|null $dispatchLogId Optional pre-created dispatch log ID
     */
    public function __construct(Faculty $faculty, $dispatchLogId = null)
    {
        $this->faculty      = $faculty;
        $this->dispatchedAt = Carbon::now();

        if ($dispatchLogId) {
            $this->dispatchLogId = $dispatchLogId;
        } else {
            $facultyUser = $faculty->user;
            $facultyName = $facultyUser
                ? $this->formatName(
                    $facultyUser->last_name,
                    $facultyUser->first_name,
                    $facultyUser->middle_name,
                    $facultyUser->suffix_name
                )
                : 'Faculty Member';
            $email = $facultyUser?->email ?? 'No email on file';

            $log = EmailDispatchLog::create([
                'faculty_id'      => $faculty->id,
                'recipient_email' => $email,
                'recipient_name'  => $facultyName,
                'purpose'         => 'deadline_warning',
                'status'          => 'queued',
                'dispatched_at'   => $this->dispatchedAt,
                'triggered_by'    => auth()->id(),
            ]);

            $this->dispatchLogId = $log->id;
        }
    }

    /**
     * Execute the job.
     */
    public function handle()
    {
        $facultyUser = $this->faculty->user;

        if (!$facultyUser || !$facultyUser->email) {
            Log::error(
                "Faculty email is missing for faculty ID: " .
                "{$this->faculty->id}"
            );

            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'        => 'failed',
                    'error_message' => 'Skipped: faculty email is missing.',
                    'processed_at'  => Carbon::now(),
                ]);
            }

            return;
        }

        if ($facultyUser->status !== 'Active') {
            Log::warning(
                "Skipping deadline email for faculty ID: {$this->faculty->id}" .
                " because faculty member is not active."
            );

            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'        => 'failed',
                    'error_message' => 'Skipped: Faculty member is inactive ' .
                        'or retired.',
                    'processed_at'  => Carbon::now(),
                ]);
            }

            return;
        }

        $preferenceSetting = $this->faculty->preferenceSetting;

        if (!$preferenceSetting || !$preferenceSetting->is_enabled) {
            Log::warning(
                "Skipping deadline email for faculty ID: {$this->faculty->id}" .
                " because preference submission is disabled."
            );

            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'        => 'failed',
                    'error_message' => 'Skipped: Preference submission is ' .
                        'disabled.',
                    'processed_at'  => Carbon::now(),
                ]);
            }

            return;
        }

        $validation = EmailValidationService::validate($facultyUser->email);

        if (!$validation['valid']) {
            Log::warning(
                "Skipping deadline email for faculty ID: {$this->faculty->id}" .
                " - {$validation['reason']}"
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
            $facultyUser->last_name,
            $facultyUser->first_name,
            $facultyUser->middle_name,
            $facultyUser->suffix_name
        );

        $deadline = Carbon::parse(
            $this->faculty->preferenceSetting->individual_deadline
        )->format('F d, Y');

        $data = [
            'faculty_name' => $facultyName,
            'deadline'     => $deadline,
        ];

        try {
            Mail::send(
                'emails.faculty_deadline_warning',
                $data,
                function ($message) use ($facultyUser) {
                    $message->to($facultyUser->email)
                        ->subject(
                            '24-Hour Notification: Individual Deadline Approaching'
                        );
                }
            );

            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'          => 'sent',
                    'recipient_email' => $facultyUser->email,
                    'recipient_name'  => $facultyName,
                    'processed_at'    => Carbon::now(),
                ]);
            } else {
                EmailDispatchLog::create([
                    'faculty_id'      => $this->faculty->id,
                    'recipient_email' => $facultyUser->email,
                    'recipient_name'  => $facultyName,
                    'purpose'         => 'deadline_warning',
                    'status'          => 'sent',
                    'dispatched_at'   => $this->dispatchedAt,
                    'processed_at'    => Carbon::now(),
                ]);
            }

            Log::info(
                "Email sent successfully to faculty ID: " .
                "{$this->faculty->id}, Email: {$facultyUser->email}"
            );
        } catch (\Exception $e) {
            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'          => 'failed',
                    'recipient_email' => $facultyUser->email,
                    'recipient_name'  => $facultyName,
                    'error_message'   => $e->getMessage(),
                    'processed_at'    => Carbon::now(),
                ]);
            } else {
                EmailDispatchLog::create([
                    'faculty_id'      => $this->faculty->id,
                    'recipient_email' => $facultyUser->email,
                    'recipient_name'  => $facultyName,
                    'purpose'         => 'deadline_warning',
                    'status'          => 'failed',
                    'error_message'   => $e->getMessage(),
                    'dispatched_at'   => $this->dispatchedAt,
                    'processed_at'    => Carbon::now(),
                ]);
            }

            Log::error(
                "Failed to send email to faculty ID: " .
                "{$this->faculty->id}. Error: {$e->getMessage()}"
            );

            $this->fail($e);
        }
    }

    /**
     * Format the faculty's full name.
     */
    private function formatName(
        $lastName,
        $firstName,
        $middleName = null,
        $suffixName = null
    ) {
        $name = "{$lastName}, {$firstName}";

        if ($middleName) {
            $name .= " {$middleName}";
        }

        if ($suffixName) {
            $name .= " {$suffixName}";
        }

        return trim($name);
    }

    /**
     * Handle job failure.
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
