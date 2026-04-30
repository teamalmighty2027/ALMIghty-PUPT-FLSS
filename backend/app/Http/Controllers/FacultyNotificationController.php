<?php

namespace App\Http\Controllers;

use App\Models\ActiveSemester;
use App\Models\Faculty;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FacultyNotificationController extends Controller
{
    /**
     * Get notifications and status information for a specific faculty.
     *
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function getFacultyNotifications(Request $request)
    {
        // Validate faculty_id in request
        $validated = $request->validate([
            'faculty_id' => 'required|exists:faculty,id',
        ]);

        $facultyId = $validated['faculty_id'];

        // Get active semester info
        $activeSemester = DB::table('active_semesters')
            ->join('academic_years', 'active_semesters.academic_year_id', '=', 'academic_years.academic_year_id')
            ->join('semesters', 'active_semesters.semester_id', '=', 'semesters.semester_id')
            ->where('active_semesters.is_faculty_view', 1)
            ->select(
                'active_semesters.active_semester_id',
                'active_semesters.academic_year_id',
                'active_semesters.semester_id',
                'academic_years.year_start',
                'academic_years.year_end',
                'semesters.semester'
            )
            ->first();

        if (!$activeSemester) {
            return response()->json(['error' => 'No active semester found'], 404);
        }

        // Get faculty preferences status and deadlines
        $preferencesSettings = DB::table('preferences_settings')
            ->where('faculty_id', $facultyId)
            ->select(
                'is_enabled',
                'individual_deadline',
                'global_deadline',
                'individual_start_date',
                'global_start_date'
            )
            ->first();

        $preferencesStatus = $preferencesSettings->is_enabled ?? false;
        $preferencesDeadline = $preferencesSettings->individual_deadline ?? $preferencesSettings->global_deadline;
        $preferencesStart = $preferencesSettings->individual_start_date ?? $preferencesSettings->global_start_date;

        // Get faculty schedule publication status
        $isSchedulePublished = DB::table('faculty_schedule_publication')
            ->where('faculty_schedule_publication.faculty_id', $facultyId)
            ->where('faculty_schedule_publication.academic_year_id', $activeSemester->academic_year_id)
            ->where('faculty_schedule_publication.semester_id', $activeSemester->semester_id)
            ->where('faculty_schedule_publication.is_published', 1)
            ->exists();

        return response()->json([
            'academic_year' => "{$activeSemester->year_start}-{$activeSemester->year_end}",
            'semester' => $this->getSemesterLabel($activeSemester->semester),
            'faculty_status' => [
                'preferences_enabled' => (bool) $preferencesStatus,
                'schedule_published' => (bool) $isSchedulePublished,
                'preferences_deadline' => $preferencesDeadline,
                'preferences_start' => $preferencesStart,
            ],
        ]);
    }

    /**
     * Get notifications for faculty access requests.
     */
    public function getRequestNotifications()
    {
        // 1. Get Active Semester safely
        $activeSemester = \App\Models\ActiveSemester::where('is_faculty_view', 1)->first();

        if (!$activeSemester) {
            return response()->json([], 200); // Return empty array instead of 404 to keep dashboard alive
        }

        // 2. Fetch Preference Requests
        $prefRequests = \App\Models\Faculty::query()
            ->join('users', 'faculty.user_id', '=', 'users.id')
            ->join('preferences_settings', 'faculty.id', '=', 'preferences_settings.faculty_id')
            ->where('preferences_settings.has_request', 1)
            ->select('faculty.id as faculty_id', 'users.first_name', 'users.last_name')
            ->get()
            ->map(function ($f) {
                return [
                    'faculty_id' => $f->faculty_id,
                    'faculty_name' => "{$f->first_name} {$f->last_name}",
                    'request_type' => 'preference'
                ];
            });

        // 3. Fetch Appeal Requests (Using the new columns you added to phpMyAdmin)
        $appealRequests = \App\Models\Faculty::query()
            ->join('users', 'faculty.user_id', '=', 'users.id')
            ->where('faculty.has_appeal_request', 1)
            ->select(
                'faculty.id as faculty_id',
                'faculty.appeal_start_date',
                'faculty.appeal_end_date',
                'users.first_name',
                'users.last_name'
            )
            ->get()
            ->map(function ($f) {
                return [
                    'faculty_id' => $f->faculty_id,
                    'faculty_name' => "{$f->first_name} {$f->last_name}",
                    'request_type' => 'appeal', // This tag tells the dashboard to show the orange badge
                    'appeal_start_date' => $f->appeal_start_date,
                    'appeal_end_date' => $f->appeal_end_date,
                ];
            });

        // Combine them into a single array
        $allNotifications = array_merge($prefRequests->toArray(), $appealRequests->toArray());

        return response()->json($allNotifications, 200);
    }

    private function getSemesterLabel($semester): string
    {
        return match ($semester) {
            1 => '1st Semester',
            2 => '2nd Semester',
            3 => 'Summer Semester',
            default => 'Unknown Semester'
        };
    }
}
