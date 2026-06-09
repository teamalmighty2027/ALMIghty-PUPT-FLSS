<?php

namespace App\Jobs;

use App\Models\ActiveSemester;
use App\Models\Faculty;
use App\Models\Preference;
use App\Http\Controllers\PreferenceController;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class AutoSubmitPreviousPreferencesJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $facultyId;

    public $tries = 3;
    public $timeout = 300;

    /**
     * Create a new job instance.
     *
     * @param int|null $facultyId
     */
    public function __construct(int $facultyId = null)
    {
        $this->facultyId = $facultyId;
    }

    /**
     * Execute the job.
     */
    public function handle()
    {
        $currentActiveSemester = ActiveSemester::where('is_active', 1)
            ->first();

        if (!$currentActiveSemester) {
            Log::warning(
                'AutoSubmitPreviousPreferencesJob: No active semester found.'
            );
            return;
        }

        if ($this->facultyId) {
            $this->processFaculty($this->facultyId, $currentActiveSemester);
        } else {
            // Global auto-submit for all active faculties
            $faculties = Faculty::whereHas('user', function ($query) {
                $query->where('status', 'Active');
            })->get();

            foreach ($faculties as $faculty) {
                $this->processFaculty($faculty->id, $currentActiveSemester);
            }
        }
    }

    /**
     * Process auto-submission for a single faculty member.
     */
    protected function processFaculty($facultyId, $currentActiveSemester)
    {
        // Join to find the latest past semester that MATCHES semester_id
        $latestPastSemesterId = Preference::join(
            'active_semesters',
            'preferences.active_semester_id',
            '=',
            'active_semesters.active_semester_id'
        )
        ->where('preferences.faculty_id', $facultyId)
        ->where(
            'preferences.active_semester_id',
            '!=',
            $currentActiveSemester->active_semester_id
        )
        ->where(
            'active_semesters.semester_id',
            $currentActiveSemester->semester_id
        )
        ->where(function ($query) {
            $query->whereNotNull('preferences.course_assignment_id')
                  ->orWhereNotNull(
                      'preferences.temporary_course_offering_id'
                  );
        })
        ->orderBy('preferences.active_semester_id', 'desc')
        ->value('preferences.active_semester_id');

        if (!$latestPastSemesterId) {
            Log::info("No past preferences found for faculty {$facultyId}.");
            return;
        }

        $previousPreferences = Preference::with([
            'courseAssignment.course',
            'courseAssignment.curriculaProgram.program',
            'temporaryCourseOffering.course',
            'temporaryCourseOffering.program',
            'preferenceDays',
            'section'
        ])
        ->where('faculty_id', $facultyId)
        ->where('active_semester_id', $latestPastSemesterId)
        ->where(function ($query) {
            $query->whereNotNull('course_assignment_id')
                  ->orWhereNotNull('temporary_course_offering_id');
        })
        ->get();

        if ($previousPreferences->isNotEmpty()) {
            PreferenceController::autoSubmitPreviousPreferences(
                $facultyId,
                $previousPreferences,
                $currentActiveSemester
            );
        }
    }
}
