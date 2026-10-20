<?php

namespace App\Jobs;

use App\Models\PreferencesSetting;
use App\Models\Faculty;
use App\Models\EmailDispatchLog;
use App\Services\EmailValidationService;
use App\Http\Controllers\PreferenceController;
use Carbon\Carbon;
use Exception;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendFacultyPreferenceEmailJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $facultyId;
    protected $is_individual;
    protected $individual_deadline;
    protected $global_deadline;
    protected $appUrl;
    protected $dispatchedAt;
    protected $dispatchLogId;

    public $tries = 3;
    public $timeout = 60;

    /**
     * Create a new job instance.
     *
     * @param int $facultyId The ID of the faculty member.
     * @param bool $is_individual Whether this is an individual deadline email.
     * @param int|null $dispatchLogId Pre-created dispatch log ID if any.
     */
    public function __construct(
        int $facultyId,
        $is_individual = false,
        $dispatchLogId = null
    ) {
        $this->facultyId     = $facultyId;
        $this->is_individual = $is_individual;
        $this->appUrl        = config('app.url');
        $this->dispatchedAt  = Carbon::now();

        // Retrieve preference settings for the faculty.
        $settings = PreferencesSetting::where('faculty_id', $facultyId)
            ->first();

        if ($settings) {
            $this->individual_deadline = $settings->individual_deadline;
            $this->global_deadline     = $settings->global_deadline;
        } else {
            $this->individual_deadline = null;
            $this->global_deadline     = null;
        }

        if ($dispatchLogId) {
            $this->dispatchLogId = $dispatchLogId;
        } else {
            $faculty = Faculty::with('user')->find($facultyId);
            $email = $faculty?->user?->email ?? 'No email on file';
            $name = $faculty?->user?->formatted_name
                ?? ($faculty?->user?->name ?? 'Faculty Member');

            $log = EmailDispatchLog::create([
                'faculty_id'      => $this->facultyId,
                'recipient_email' => $email,
                'recipient_name'  => $name ?: null,
                'purpose'         => 'preference_toggle',
                'status'          => 'queued',
                'dispatched_at'   => $this->dispatchedAt,
                'triggered_by'    => auth()->id(),
            ]);

            $this->dispatchLogId = $log->id;
        }
    }

    /**
     * Execute the job — sends the preference-open email to the faculty.
     */
    public function handle()
    {
        $previousPreferencesData = PreferenceController::
            getFacultyPreviousPreferenceHistory(
                $this->facultyId,
                $this->is_individual
            );

        if (!$previousPreferencesData) {
            Log::warning(
                "Skipping preference email for faculty ID: " .
                $this->facultyId .
                " because settings are disabled or faculty/user not found."
            );

            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'        => 'failed',
                    'error_message' => 'Skipped: Preferences disabled or ' .
                        'faculty/user not found.',
                    'processed_at'  => Carbon::now(),
                ]);
            }

            return;
        }

        $email = $previousPreferencesData['email'] ?? null;
        $name = $previousPreferencesData['faculty_name'] ?? null;

        if (!$name || $name === 'N/A') {
            $faculty = Faculty::with('user')->find($this->facultyId);
            $name = $faculty?->user?->formatted_name
                ?? ($faculty?->user?->name ?? null);
        }

        $name = trim($name ?? '');

        if (!$email) {
            Log::warning(
                "Skipping preference email for faculty ID: " .
                $this->facultyId .
                " because email address is missing."
            );

            if ($this->dispatchLogId) {
                EmailDispatchLog::where('id', $this->dispatchLogId)->update([
                    'status'        => 'failed',
                    'error_message' => 'Skipped: Email address is missing.',
                    'processed_at'  => Carbon::now(),
                ]);
            }

            return;
        }

        $validation = EmailValidationService::validate($email);

        if (!$validation['valid']) {
            Log::warning(
                "Skipping preference email for faculty ID: " .
                "{$this->facultyId} - {$validation['reason']}"
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

        $previousPreferencesData['app_url'] = rtrim($this->appUrl, '/');

        $template = $this->is_individual
            ? 'emails.preferences_single_open'
            : 'emails.preferences_all_open';

        try {
            Mail::send(
                $template,
                $previousPreferencesData,
                function ($message) use ($email) {
                    $message->to($email)
                        ->subject(
                            'Faculty Load & Schedule Preferences ' .
                            'Submission is now open'
                        );
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
                    'faculty_id'      => $this->facultyId,
                    'recipient_email' => $email,
                    'recipient_name'  => $name ?: null,
                    'purpose'         => 'preference_toggle',
                    'status'          => 'sent',
                    'dispatched_at'   => $this->dispatchedAt,
                    'processed_at'    => Carbon::now(),
                ]);
            }

            Log::info(
                'Preference submission email sent to ' . $email
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
                    'faculty_id'      => $this->facultyId,
                    'recipient_email' => $email,
                    'recipient_name'  => $name ?: null,
                    'purpose'         => 'preference_toggle',
                    'status'          => 'failed',
                    'error_message'   => $e->getMessage(),
                    'dispatched_at'   => $this->dispatchedAt,
                    'processed_at'    => Carbon::now(),
                ]);
            }

            Log::error(
                'Failed to send email to ' . $email .
                ' (faculty ID ' . $this->facultyId . '): ' .
                $e->getMessage()
            );

            $this->fail($e);
        }
    }

    /**
     * Called when the job exhausts all its retry attempts.
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

        Log::error(
            'SendFacultyPreferenceEmailJob permanently failed for' .
            ' faculty ID ' . $this->facultyId . ': ' .
            $exception->getMessage()
        );
    }
}