<?php

namespace App\Http\Controllers;

use App\Models\ActiveSemester;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class AnalyticsController extends Controller
{
    /**
     * Helper to get requested or active semester
     */
    private function getActiveSemester($semesterId = null)
    {
        $query = DB::table('active_semesters')
            ->join(
                'academic_years', 
                'active_semesters.academic_year_id', 
                '=', 
                'academic_years.academic_year_id'
            )
            ->join(
                'semesters', 
                'active_semesters.semester_id', 
                '=', 
                'semesters.semester_id'
            );

        if ($semesterId && $semesterId !== 'null') {
            $query->where('active_semesters.active_semester_id', $semesterId);
        } else {
            $query->where('active_semesters.is_active', 1);
        }

        return $query->select(
            'active_semesters.active_semester_id',
            'active_semesters.semester_id',
            'academic_years.academic_year_id',
            'academic_years.year_start',
            'academic_years.year_end',
            'semesters.semester'
        )->first();
    }


    /**
     * Widget A: Schedule Time Heatmap
     * Retrieves the number of schedules per day and time.
     */
    public function getScheduleHeatmap(Request $request)
    {
        $activeSemester = $this->getActiveSemester(
            $request->query('active_semester_id')
        );

        if (!$activeSemester) {
            return response()->json(
                ['message' => 'No active semester found.'], 
                404
            );
        }

        $data = DB::table('schedules')
            ->join(
                'section_courses', 
                'schedules.section_course_id', 
                '=', 
                'section_courses.section_course_id'
            )
            ->join(
                'course_assignments',
                'section_courses.course_assignment_id',
                '=',
                'course_assignments.course_assignment_id'
            )
            ->join(
                'semesters',
                'course_assignments.semester_id',
                '=',
                'semesters.semester_id'
            )
            ->join(
                'sections_per_program_year', 
                'section_courses.sections_per_program_year_id', 
                '=', 
                'sections_per_program_year.sections_per_program_year_id'
            )
            ->where(
                'sections_per_program_year.academic_year_id', 
                $activeSemester->academic_year_id
            )
            ->where(
                'semesters.semester',
                $activeSemester->semester
            )
            ->whereNotNull('schedules.day')
            ->whereNotNull('schedules.start_time')
            ->select(
                'schedules.day', 
                'schedules.start_time', 
                DB::raw('count(*) as count')
            )
            ->groupBy('schedules.day', 'schedules.start_time')
            ->get();

        return response()->json([
            'semester' => $activeSemester,
            'data' => $data
        ]);
    }


    /**
     * Widget B: Room Utilization
     * Retrieves the total scheduled minutes per room.
     */
    public function getRoomUtilization(Request $request)
    {
        $activeSemester = $this->getActiveSemester(
            $request->query('active_semester_id')
        );

        if (!$activeSemester) {
            return response()->json(
                ['message' => 'No active semester found.'], 
                404
            );
        }

        // Sum of scheduled minutes per room
        $utilization = DB::table('rooms')
            ->leftJoin('schedules', 'rooms.room_id', '=', 'schedules.room_id')
            ->leftJoin(
                'section_courses', 
                'schedules.section_course_id', 
                '=', 
                'section_courses.section_course_id'
            )
            ->leftJoin(
                'course_assignments',
                'section_courses.course_assignment_id',
                '=',
                'course_assignments.course_assignment_id'
            )
            ->leftJoin(
                'semesters',
                'course_assignments.semester_id',
                '=',
                'semesters.semester_id'
            )
            ->leftJoin(
                'sections_per_program_year', 
                'section_courses.sections_per_program_year_id', 
                '=', 
                'sections_per_program_year.sections_per_program_year_id'
            )
            ->select(
                'rooms.room_id',
                'rooms.room_code',
                'rooms.capacity',
                DB::raw("
                    SUM(CASE WHEN 
                        sections_per_program_year.academic_year_id = {$activeSemester->academic_year_id} AND 
                        semesters.semester = {$activeSemester->semester}
                    THEN TIMESTAMPDIFF(MINUTE, schedules.start_time, schedules.end_time) 
                    ELSE 0 END) as total_scheduled_minutes
                ")
            )
            ->groupBy('rooms.room_id', 'rooms.room_code', 'rooms.capacity')
            ->get();

        return response()->json($utilization);
    }


    /**
     * Widget C: Faculty Load Distribution
     * Retrieves the number of assigned units per faculty.
     */
    public function getFacultyLoadDistribution(Request $request)
    {
        $activeSemester = $this->getActiveSemester(
            $request->query('active_semester_id')
        );

        if (!$activeSemester) {
            return response()->json(
                ['message' => 'No active semester found.'], 
                404
            );
        }

        $loads = DB::table('faculty')
            ->join('users', 'faculty.user_id', '=', 'users.id')
            ->join(
                'faculty_type', 
                'faculty.faculty_type_id', 
                '=', 
                'faculty_type.faculty_type_id'
            )
            ->leftJoin('schedules', 'faculty.id', '=', 'schedules.faculty_id')
            ->leftJoin(
                'section_courses', 
                'schedules.section_course_id', 
                '=', 
                'section_courses.section_course_id'
            )
            ->leftJoin(
                'course_assignments', 
                'section_courses.course_assignment_id', 
                '=', 
                'course_assignments.course_assignment_id'
            )
            ->leftJoin(
                'semesters',
                'course_assignments.semester_id',
                '=',
                'semesters.semester_id'
            )
            ->leftJoin(
                'courses', 
                'course_assignments.course_id', 
                '=', 
                'courses.course_id'
            )
            ->leftJoin(
                'sections_per_program_year',
                'section_courses.sections_per_program_year_id',
                '=',
                'sections_per_program_year.sections_per_program_year_id'
            )
            ->select(
                'faculty.id',
                'users.first_name',
                'users.last_name',
                'faculty_type.regular_units',
                'faculty_type.additional_units',
                DB::raw("
                    SUM(DISTINCT CASE WHEN 
                        sections_per_program_year.academic_year_id = {$activeSemester->academic_year_id} AND 
                        semesters.semester = {$activeSemester->semester}
                    THEN courses.units ELSE 0 END) as assigned_units
                ")
            )
            ->groupBy(
                'faculty.id', 
                'users.first_name', 
                'users.last_name', 
                'faculty_type.regular_units', 
                'faculty_type.additional_units'
            )
            ->get();

        return response()->json($loads);
    }


    /**
     * Widget F: Faculty Type Composition
     * Retrieves the number of faculty by type.
     */
    public function getFacultyTypeComposition()
    {
        $composition = DB::table('faculty')
            ->join(
                'faculty_type', 
                'faculty.faculty_type_id', 
                '=', 
                'faculty_type.faculty_type_id'
            )
            ->select('faculty_type.faculty_type', DB::raw('count(*) as count'))
            ->groupBy('faculty_type.faculty_type')
            ->get();

        return response()->json($composition);
    }


    /**
     * Widget G: Appeal Activity
     * Retrieves the number of appeals by status.
     */
    public function getAppealActivity(Request $request)
    {
        $activeSemester = $this->getActiveSemester($request->query('active_semester_id'));
        
        $stats = DB::table('appeals')
            ->select(
                DB::raw('count(*) as total'),
                DB::raw('
                    sum(case when is_approved = 1 then 1 else 0 end) as approved
                '),
                DB::raw('
                    sum(case when is_approved = 0 then 1 else 0 end) as pending_denied
                ')
            )
            ->first();

        return response()->json($stats);
    }


    /**
     * Widget E: Program Coverage
     * Retrieves the number of courses and schedules per program.
     */
    public function getProgramCoverage(Request $request)
    {
        $activeSemester = $this->getActiveSemester(
            $request->query('active_semester_id')
        );

        if (!$activeSemester) {
            return response()->json(
                ['message' => 'No active semester found.'], 
                404
            );
        }

        $coverage = DB::table('programs')
            ->leftJoin(
                'sections_per_program_year', 
                'programs.program_id', 
                '=', 
                'sections_per_program_year.program_id'
            )
            ->leftJoin(
                'section_courses', 
                'sections_per_program_year.sections_per_program_year_id', 
                '=', 
                'section_courses.sections_per_program_year_id'
            )
            ->leftJoin(
                'course_assignments',
                'section_courses.course_assignment_id',
                '=',
                'course_assignments.course_assignment_id'
            )
            ->leftJoin(
                'semesters',
                'course_assignments.semester_id',
                '=',
                'semesters.semester_id'
            )
            ->leftJoin(
                'schedules', 
                'section_courses.section_course_id', 
                '=', 
                'schedules.section_course_id'
            )
            ->select(
                'programs.program_code',
                DB::raw("
                    COUNT(DISTINCT CASE WHEN 
                        sections_per_program_year.academic_year_id = {$activeSemester->academic_year_id} AND 
                        semesters.semester = {$activeSemester->semester}
                    THEN section_courses.section_course_id END) as total_courses
                "),
                DB::raw("
                    COUNT(DISTINCT CASE WHEN 
                        sections_per_program_year.academic_year_id = {$activeSemester->academic_year_id} AND 
                        semesters.semester = {$activeSemester->semester}
                    THEN schedules.schedule_id END) as scheduled_courses
                ")
            )
            ->groupBy('programs.program_code')
            ->get();

        return response()->json($coverage);
    }


    /**
     * Widget H: Multi-Semester Trends
     * Retrieves the number of courses and schedules per semester.
     */
    public function getSemesterTrends()
    {
        // Get last 5 semesters
        $semesters = DB::table('active_semesters')
            ->join(
                'academic_years', 
                'active_semesters.academic_year_id', 
                '=', 
                'academic_years.academic_year_id'
            )
            ->join(
                'semesters', 
                'active_semesters.semester_id', 
                '=', 
                'semesters.semester_id'
            )
            ->orderBy('academic_years.year_start', 'desc')
            ->orderBy('semesters.semester_id', 'desc')
            ->limit(5)
            ->select(
                'active_semesters.active_semester_id',
                'academic_years.year_start',
                'academic_years.year_end',
                'semesters.semester'
            )
            ->get();

        $trends = [];

        foreach ($semesters as $sem) {
            $totalCourses = DB::table('section_courses')
                ->join(
                    'sections_per_program_year', 
                    'section_courses.sections_per_program_year_id', 
                    '=', 
                    'sections_per_program_year.sections_per_program_year_id'
                )
                ->where(
                    'sections_per_program_year.academic_year_id', 
                    $sem->active_semester_id
                )
                ->count();
            
            $scheduledCourses = DB::table('schedules')
                ->join(
                    'section_courses', 
                    'schedules.section_course_id', 
                    '=', 
                    'section_courses.section_course_id'
                )
                ->join(
                    'sections_per_program_year', 
                    'section_courses.sections_per_program_year_id', 
                    '=', 
                    'sections_per_program_year.sections_per_program_year_id'
                )
                ->where(
                    'sections_per_program_year.academic_year_id', 
                    $sem->active_semester_id
                )
                ->count();

            $trends[] = [
                'semester_label' => "{$sem->year_start}-{$sem->year_end} {$sem->semester}",
                'scheduling_progress' => $totalCourses > 0 
                    ? round(($scheduledCourses / $totalCourses) * 100, 2) 
                    : 0,
            ];
        }

        return response()->json(array_reverse($trends));
    }


    /**
     * Widget D: Preference Insights
     * Retrieves the number of faculty with submitted preferences.
     */
    public function getPreferenceInsights(Request $request)
    {
        $activeSemester = $this->getActiveSemester(
            $request->query('active_semester_id')
        );

        if (!$activeSemester) {
            return response()->json(
                ['message' => 'No active semester found.'], 
                404
            );
        }

        $totalFaculty = DB::table('faculty')->count();
        
        $submitted = DB::table('preference_settings')
            ->where('has_request', 1)
            ->count();

        return response()->json([
            'total_faculty' => $totalFaculty,
            'submitted' => $submitted,
            'pending' => $totalFaculty - $submitted
        ]);
    }


    /**
     * Widget I: Optimal Time-Slot Recommendations
     * Retrieves the optimal time slots for scheduling based on faculty preferences.
     */
    public function getOptimalSlots(Request $request)
    {
        $activeSemester = $this->getActiveSemester(
            $request->query('active_semester_id')
        );

        if (!$activeSemester) {
            return response()->json(
                ['message' => 'No active semester found.'], 
                404
            );
        }

        // Get preference frequency per slot
        $preferences = DB::table('preference_days')
            ->select('day', 'start_time', DB::raw('count(*) as pref_count'))
            ->groupBy('day', 'start_time')
            ->get();

        // Get current schedule frequency per slot
        $schedules = DB::table('schedules')
            ->join(
                'section_courses', 
                'schedules.section_course_id', 
                '=', 
                'section_courses.section_course_id'
            )
            ->join(
                'sections_per_program_year', 
                'section_courses.sections_per_program_year_id', 
                '=', 
                'sections_per_program_year.sections_per_program_year_id'
            )
            ->where(
                'sections_per_program_year.academic_year_id', 
                $activeSemester->academic_year_id
            )
            ->select('day', 'start_time', DB::raw('count(*) as sched_count'))
            ->groupBy('day', 'start_time')
            ->get();

        return response()->json([
            'preferences' => $preferences,
            'schedules' => $schedules
        ]);
    }
}
