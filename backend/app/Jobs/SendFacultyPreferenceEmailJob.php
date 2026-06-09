<?php

namespace App\Jobs;

use App\Models\Faculty as FacultyModel;
use App\Models\PreferencesSetting;
use App\Models\Faculty;
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

    public $tries = 10;
    public $timeout = 300;

    /**
     * Create a new job instance.
     *
     * @param int $facultyId The ID of the faculty member.
     * @param bool $is_individual Indicates if the email is for an individual deadline.
     */
    public function __construct(int $facultyId, $is_individual = false)
    {
        $this->facultyId = $facultyId;
        $this->is_individual = $is_individual;
        $this->appUrl = config('app.url');

        // Retrieve preference settings for the faculty.
        $settings = PreferencesSetting::where('faculty_id', $facultyId)->first();

        // Only set deadlines if settings exist
        if ($settings) {
            $this->individual_deadline = $settings->individual_deadline;
            $this->global_deadline = $settings->global_deadline;
        } else {
            $this->individual_deadline = null;
            $this->global_deadline = null;
        }
    }

    /**
     * Execute the job.
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

        $previousPreferencesData['app_url'] = rtrim($this->appUrl, '/');

        $template = $this->is_individual
            ? 'emails.preferences_single_open'
            : 'emails.preferences_all_open';

        try {
            if (!$previousPreferencesData['email']) {
                throw new \Exception('Faculty email address is missing');
            }

            Mail::send(
                $template,
                $previousPreferencesData,
                function ($message) use ($previousPreferencesData) {
                    $message->to($previousPreferencesData['email'])
                        ->subject(
                            'Faculty Load & Schedule Preferences ' .
                            'Submission is now open'
                        );
                }
            );

            Log::info(
                'Preference submission email sent to ' .
                $previousPreferencesData['email']
            );
        } catch (\Exception $e) {
            Log::error(
                'Failed to send email to ' .
                ($previousPreferencesData['email'] ?? 'unknown email') .
                ': ' . $e->getMessage()
            );

            throw $e;
        }
    }

    public function failed(Exception $exception)
    {
        Log::error('Job failed: ' . $exception->getMessage());
    }
}