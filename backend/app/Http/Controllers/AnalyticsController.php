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
        $activeSemester = $this->getActiveSemester(
            $request->query('active_semester_id')
        );

        if (!$activeSemester) {
            return response()->json(['total' => 0, 'approved' => 0, 'pending' => 0]);
        }
        
        $stats = DB::table('appeals')
            ->join('schedules', 'appeals.schedule_id', '=', 'schedules.schedule_id')
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
            ->where('semesters.semester', $activeSemester->semester)
            ->where(
                'sections_per_program_year.academic_year_id', 
                $activeSemester->academic_year_id
            )
            ->select(
                DB::raw('count(*) as total'),
                DB::raw('
                    sum(case when is_approved = 1 then 1 else 0 end) as approved
                '),
                DB::raw('
                    sum(case when is_approved = 0 then 1 else 0 end) as denied
                '),
                DB::raw('
                    sum(case when is_approved IS NULL then 1 else 0 end) as pending
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

        // Get all programs first to ensure we return all of them
        $programs = DB::table('programs')->select('program_id', 'program_code')->get();
        
        // Get schedules grouped by program
        $schedulesData = DB::table('schedules')
            ->join('section_courses', 'schedules.section_course_id', '=', 'section_courses.section_course_id')
            ->join('course_assignments', 'section_courses.course_assignment_id', '=', 'course_assignments.course_assignment_id')
            ->join('semesters as ca_semesters', 'ca_semesters.semester_id', '=', 'course_assignments.semester_id')
            ->join('sections_per_program_year', 'section_courses.sections_per_program_year_id', '=', 'sections_per_program_year.sections_per_program_year_id')
            ->join('programs', 'sections_per_program_year.program_id', '=', 'programs.program_id')
            ->where('ca_semesters.semester', '=', $activeSemester->semester)
            ->where('sections_per_program_year.academic_year_id', '=', $activeSemester->academic_year_id)
            ->select(
                'programs.program_code',
                DB::raw('COUNT(schedules.schedule_id) as total_schedules'),
                DB::raw('
                    SUM(
                        (CASE WHEN schedules.day IS NULL THEN 1 ELSE 0 END) +
                        (CASE WHEN schedules.start_time IS NULL THEN 1 ELSE 0 END) +
                        (CASE WHEN schedules.end_time IS NULL THEN 1 ELSE 0 END) +
                        (CASE WHEN schedules.faculty_id IS NULL THEN 1 ELSE 0 END) +
                        (CASE WHEN schedules.room_id IS NULL THEN 1 ELSE 0 END)
                    ) as total_null_fields
                ')
            )
            ->groupBy('programs.program_code')
            ->get()
            ->keyBy('program_code');

        $coverage = $programs->map(function ($program) use ($schedulesData) {
            $data = $schedulesData->get($program->program_code);
            
            $totalSchedules = $data ? $data->total_schedules : 0;
            $totalNullFields = $data ? $data->total_null_fields : 0;
            
            $totalPossibleFields = $totalSchedules * 5;
            $totalFilledFields = $totalPossibleFields - $totalNullFields;
            
            return [
                'program_code' => $program->program_code,
                'total_courses' => $totalPossibleFields,
                'scheduled_courses' => $totalFilledFields,
            ];
        })->values()->toArray();

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
                'active_semesters.academic_year_id',
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
                    $sem->academic_year_id
                )
                ->where(
                    'semesters.semester',
                    $sem->semester
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
                    $sem->academic_year_id
                )
                ->where(
                    'semesters.semester',
                    $sem->semester
                )
                ->count();

            $semLabel = $sem->semester == 1 ? '1st Sem' : ($sem->semester == 2 ? '2nd Sem' : 'Summer');
            
            $trends[] = [
                'semester_label' => "{$sem->year_start}-{$sem->year_end} {$semLabel}",
                'scheduling_progress' => $totalCourses > 0 
                    ? round(($scheduledCourses / $totalCourses) * 100, 2) 
                    : 0,
            ];
        }

        return response()->json(array_reverse($trends));
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
            return response()->json(['preferences' => [], 'schedules' => []]);
        }

        // Get preference frequency per slot
        $preferences = DB::table('preference_days')
            ->join('preferences', 'preference_days.preference_id', '=', 'preferences.preferences_id')
            ->where('preferences.active_semester_id', $activeSemester->active_semester_id)
            ->select('preferred_day as day', 'preferred_start_time as start_time', DB::raw('count(*) as pref_count'))
            ->groupBy('preferred_day', 'preferred_start_time')
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
            ->where('semesters.semester', $activeSemester->semester)
            ->select('day', 'start_time', DB::raw('count(*) as sched_count'))
            ->groupBy('day', 'start_time')
            ->get();

        return response()->json([
            'preferences' => $preferences,
            'schedules' => $schedules
        ]);
    }


    /**
     * Prescriptive Widget 1: Underutilized Rooms
     * Identifies rooms that are below an occupancy threshold.
     */
    public function getUnderutilizedRooms(Request $request)
    {
        $activeSemester = $this->getActiveSemester(
            $request->query('active_semester_id')
        );

        if (!$activeSemester) {
            return response()->json([]);
        }

        $threshold = $request->query('threshold', 20); // Default 20%
        
        $utilization = $this->getRoomUtilization($request)->original;
        
        $totalMinutesPossible = 5 * 10 * 60; // 5 days, 10 hours/day (3000 mins/week)
        
        $underutilized = collect($utilization)->map(function($room) use ($totalMinutesPossible) {
            $percent = ($room->total_scheduled_minutes / $totalMinutesPossible) * 100;
            return [
                'room_code' => $room->room_code,
                'capacity' => $room->capacity,
                'total_scheduled_minutes' => $room->total_scheduled_minutes,
                'utilization_percent' => round($percent, 2),
                'severity' => $percent < 10 ? 'high' : ($percent < 20 ? 'medium' : 'low')
            ];
        })->filter(function($room) use ($threshold) {
            return $room['utilization_percent'] < $threshold;
        })->values();

        return response()->json($underutilized);
    }


    /**
     * Prescriptive Widget 2: Faculty Load Analysis
     * Surfaces overloaded and underutilized faculty.
     */
    public function getFacultyLoadAnalysis(Request $request)
    {
        $activeSemester = $this->getActiveSemester(
            $request->query('active_semester_id')
        );

        if (!$activeSemester) {
            return response()->json([]);
        }

        $loads = $this->getFacultyLoadDistribution($request)->original;
        
        $analysis = collect($loads)->map(function($faculty) {
            $delta = $faculty->assigned_units - $faculty->regular_units;
            return [
                'name' => $faculty->first_name . ' ' . $faculty->last_name,
                'assigned_units' => $faculty->assigned_units,
                'regular_units' => $faculty->regular_units,
                'delta' => $delta,
                'status' => $delta > 0 ? 'overloaded' : ($delta < 0 ? 'underloaded' : 'optimal')
            ];
        })->values();

        return response()->json($analysis);
    }


    /**
     * Prescriptive Widget 3: Conflict Risk
     * Identifies overlapping schedules for the same room or faculty.
     */
    public function getConflictRisk(Request $request)
    {
        $activeSemester = $this->getActiveSemester(
            $request->query('active_semester_id')
        );

        if (!$activeSemester) {
            return response()->json([]);
        }

        $schedules = DB::table('schedules')
            ->join('section_courses', 'schedules.section_course_id', '=', 'section_courses.section_course_id')
            ->join('course_assignments', 'section_courses.course_assignment_id', '=', 'course_assignments.course_assignment_id')
            ->join('semesters', 'course_assignments.semester_id', '=', 'semesters.semester_id')
            ->join('sections_per_program_year', 'section_courses.sections_per_program_year_id', '=', 'sections_per_program_year.sections_per_program_year_id')
            ->where('sections_per_program_year.academic_year_id', $activeSemester->academic_year_id)
            ->where('semesters.semester', $activeSemester->semester)
            ->whereNotNull('day')
            ->whereNotNull('start_time')
            ->select('schedule_id', 'day', 'start_time', 'end_time', 'room_id', 'faculty_id')
            ->get();

        $conflicts = [];
        $count = count($schedules);

        for ($i = 0; $i < $count; $i++) {
            for ($j = $i + 1; $j < $count; $j++) {
                $s1 = $schedules[$i];
                $s2 = $schedules[$j];

                if ($s1->day === $s2->day) {
                    // Check time overlap
                    $overlap = ($s1->start_time < $s2->end_time && $s2->start_time < $s1->end_time);

                    if ($overlap) {
                        if ($s1->room_id && $s1->room_id === $s2->room_id) {
                            $conflicts[] = [
                                'type' => 'room',
                                'entity_id' => $s1->room_id,
                                'schedules' => [$s1->schedule_id, $s2->schedule_id]
                            ];
                        }
                        if ($s1->faculty_id && $s1->faculty_id === $s2->faculty_id) {
                            $conflicts[] = [
                                'type' => 'faculty',
                                'entity_id' => $s1->faculty_id,
                                'schedules' => [$s1->schedule_id, $s2->schedule_id]
                            ];
                        }
                    }
                }
            }
        }

        return response()->json($conflicts);
    }


    /**
     * Prescriptive Widget 4: Program Laggards
     * Surfaces programs with low scheduling progress.
     */
    public function getProgramLaggards(Request $request)
    {
        $coverage = $this->getProgramCoverage($request)->original;
        
        $laggards = collect($coverage)->map(function($prog) {
            $progress = $prog['total_courses'] > 0 
                ? ($prog['scheduled_courses'] / $prog['total_courses']) * 100 
                : 0;
            return [
                'program_code' => $prog['program_code'],
                'progress' => round($progress, 2),
                'severity' => $progress < 25 ? 'critical' : 'warning'
            ];
        })->filter(function($prog) {
            return $prog['progress'] < 50;
        })->values();

        return response()->json($laggards);
    }
}
