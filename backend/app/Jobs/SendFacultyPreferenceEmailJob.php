<?php

namespace App\Jobs;

use App\Models\Faculty as FacultyModel;
use App\Models\PreferencesSetting;
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
     *
     * This method sends an email to the faculty member regarding their preference submission.
     */
    public function handle()
    {
        // Retrieve the faculty model using the provided ID with eager loading of user relationship
        $faculty = FacultyModel::with('user')->find($this->facultyId);

        if (!$faculty || !$faculty->user) {
            Log::error('Faculty or User not found for ID: ' . $this->facultyId);
            return;
        }

        $settings = PreferencesSetting::where('faculty_id', $this->facultyId)->first();

        if (!$settings || !$settings->is_enabled) {
            return;
        }

        $deadline = $this->is_individual && $this->individual_deadline
            ? $this->individual_deadline
            : $this->global_deadline;

        $formatted_deadline = $deadline ? Carbon::parse($deadline)->setTimezone('Asia/Manila')->format('M d, Y') : 'No deadline set';

        $days_left = null;
        if ($deadline) {
            $today = Carbon::now('Asia/Manila')->startOfDay();
            $target_deadline = Carbon::parse($deadline)->setTimezone('Asia/Manila')->endOfDay();

            if ($today->gt($target_deadline)) {
                $days_left = 0; 
            } else {
                $days_left = floor($today->diffInDays($target_deadline, false));
            }
        }

        // --- FETCH PREVIOUS PREFERENCES AND SEMESTER DETAILS ---
        $currentActiveSemester = \App\Models\ActiveSemester::where('is_faculty_view', 1)->first();

        $previousPreferences = [];
        $previous_academic_year = '';
        $previous_semester_label = '';

        if ($currentActiveSemester) {
            // Join to find the latest past semester that MATCHES the current semester_id (e.g. 1st sem to 1st sem)
            $latestPastSemesterId = \App\Models\Preference::join('active_semesters', 'preferences.active_semester_id', '=', 'active_semesters.active_semester_id')
                ->where('preferences.faculty_id', $this->facultyId)
                ->where('preferences.active_semester_id', '!=', $currentActiveSemester->active_semester_id)
                ->where('active_semesters.semester_id', $currentActiveSemester->semester_id) // Match semester type
                ->where(function($query) {
                    $query->whereNotNull('preferences.course_assignment_id')
                          ->orWhereNotNull('preferences.temporary_course_offering_id');
                })
                ->orderBy('preferences.active_semester_id', 'desc')
                ->value('preferences.active_semester_id');

            if ($latestPastSemesterId) {
                // Eager load everything needed for the UI table
                $previousPreferences = \App\Models\Preference::with([
                    'courseAssignment.course',
                    'courseAssignment.curriculaProgram.program',
                    'temporaryCourseOffering.course',
                    'temporaryCourseOffering.program',
                    'preferenceDays',
                    'section' // <-- Added to get Year and Section
                ])
                ->where('faculty_id', $this->facultyId)
                ->where('active_semester_id', $latestPastSemesterId)
                ->where(function($query) {
                    $query->whereNotNull('course_assignment_id')
                          ->orWhereNotNull('temporary_course_offering_id');
                })
                ->get();

                $pastActiveSemester = \App\Models\ActiveSemester::with(['academicYear', 'semester'])
                    ->find($latestPastSemesterId);

                if ($pastActiveSemester && $pastActiveSemester->academicYear) {
                    $previous_academic_year = $pastActiveSemester->academicYear->year_start . '-' . $pastActiveSemester->academicYear->year_end;
                    $semId = $pastActiveSemester->semester_id;
                    $previous_semester_label = $semId == 1 ? '1st Semester' : ($semId == 2 ? '2nd Semester' : 'Summer Semester');
                }
            }
        }
        // ---------------------------------------------------

        $dataPreference = [
            'faculty_name' => $faculty->user->name ?? 'Faculty Member',
            'email' => $faculty->user->email,
            'faculty_units' => $faculty->faculty_units ?? 0,
            'deadline' => $formatted_deadline,
            'days_left' => $days_left,
            'previousPreferences' => $previousPreferences,
            'previous_academic_year' => $previous_academic_year,
            'previous_semester_label' => $previous_semester_label,
            'app_url' => $this->appUrl
        ];

        $template = $this->is_individual ? 'emails.preferences_single_open' : 'emails.preferences_all_open';

        try {
            if (!$dataPreference['email']) {
                throw new \Exception('Faculty email address is missing');
            }

            Mail::send($template, $dataPreference, function ($message) use ($dataPreference) {
                $message->to($dataPreference['email'])
                    ->subject('Faculty Load & Schedule Preferences Submission is now open');
            });
        } catch (\Exception $e) {
            Log::error('Failed to send email to ' . ($dataPreference['email'] ?? 'unknown email') . ': ' . $e->getMessage());
            throw $e;
        }
    }

    /**
     * Handle a job failure.
     *
     * @param  \Exception  $exception The exception that caused the failure.
     */
    public function failed(Exception $exception)
    {
        // Log the error message if the job fails.
        Log::error('Job failed: ' . $exception->getMessage());
    }
}