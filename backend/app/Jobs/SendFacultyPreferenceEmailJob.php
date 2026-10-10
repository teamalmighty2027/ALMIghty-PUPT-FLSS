<?php

namespace App\Jobs;

use App\Models\PreferencesSetting;
use App\Models\Faculty;
use App\Http\Controllers\PreferenceController;
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

    public $tries = 3;
    public $timeout = 60;

    /**
     * Create a new job instance.
     *
     * @param int $facultyId The ID of the faculty member.
     * @param bool $is_individual Whether this is an individual deadline email.
     */
    public function __construct(int $facultyId, $is_individual = false)
    {
        $this->facultyId     = $facultyId;
        $this->is_individual = $is_individual;
        $this->appUrl        = config('app.url');

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

            return;
        }

        $email = $previousPreferencesData['email'] ?? null;

        if (!$email) {
            Log::warning(
                "Skipping preference email for faculty ID: " .
                $this->facultyId .
                " because email address is missing."
            );

            return;
        }

        $previousPreferencesData['app_url'] = rtrim($this->appUrl, '/');
        $pilotTesting = storage_path('app/public/PilotTestingLetter.pdf');
        $emailUsage = storage_path('app/public/EmailUsage.pdf');

        $template = $this->is_individual
            ? 'emails.preferences_single_open'
            : 'emails.preferences_all_open';

        try {
            Mail::send(
                $template,
                $previousPreferencesData,
                function ($message) use ($email, $pilotTesting, $emailUsage) {
                    $message->to($email)
                        ->subject(
                            'Faculty Load & Schedule Preferences ' .
                            'Submission is now open'
                        )
                        ->attach(
                            $pilotTesting,
                            [
                                'as' => 'Pilot_Testing_Letter.pdf',
                                'mime' => 'application/pdf',
                            ]
                        )
                        ->attach(
                            $emailUsage,
                            [
                                'as' => 'Email_Usage.pdf',
                                'mime' => 'application/pdf',
                            ]
                        );
                }
            );

            Log::info(
                'Preference submission email sent to ' . $email
            );
        } catch (\Exception $e) {
            Log::error(
                'Failed to send email to ' . $email .
                ' (faculty ID ' . $this->facultyId . '): ' .
                $e->getMessage()
            );
        }
    }

    /**
     * Called when the job exhausts all its retry attempts.
     */
    public function failed(Exception $exception)
    {
        Log::error(
            'SendFacultyPreferenceEmailJob permanently failed for' .
            ' faculty ID ' . $this->facultyId . ': ' .
            $exception->getMessage()
        );
    }
}