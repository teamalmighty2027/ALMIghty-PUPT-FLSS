<?php

namespace App\Http\Controllers;

use App\Models\AcademicYear;
use App\Models\ActiveSemester;
use App\Models\Faculty;
use App\Models\PreferencesSetting;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Log;

class ReportsController extends Controller
{
    /**
     * Get ALL Faculty Schedules Report
     */
    public function getFacultySchedulesReport(Request $request)
    {
        // Step 1: Retrieve the requested semester or fallback to current active
        $requestedSemesterId = $request->query('active_semester_id');

        $activeSemesterQuery = DB::table('active_semesters')
            ->join('academic_years', 'active_semesters.academic_year_id', '=', 'academic_years.academic_year_id')
            ->join('semesters', 'active_semesters.semester_id', '=', 'semesters.semester_id')
            ->select(
                'active_semesters.active_semester_id',
                'active_semesters.semester_id',
                'academic_years.academic_year_id',
                'academic_years.year_start',
                'academic_years.year_end',
                'semesters.semester'
            );

        if ($requestedSemesterId && $requestedSemesterId !== 'null') {
            $activeSemesterQuery->where('active_semesters.active_semester_id', $requestedSemesterId);
        } else {
            $activeSemesterQuery->where('active_semesters.is_active', 1);
        }

        $activeSemester = $activeSemesterQuery->first();

        if (!$activeSemester) {
            return response()->json(['message' => 'No active semester found.'], 404);
        }

        // Step 2: Prepare a subquery to get schedules for the current semester and academic year
        $schedulesSub = DB::table('schedules')
            ->join('section_courses', 'schedules.section_course_id', '=', 'section_courses.section_course_id')
            ->leftJoin('course_assignments', 'course_assignments.course_assignment_id', '=', 'section_courses.course_assignment_id')
            ->leftJoin('semesters as ca_semesters', 'ca_semesters.semester_id', '=', 'course_assignments.semester_id')
            ->join('sections_per_program_year', 'sections_per_program_year.sections_per_program_year_id', '=', 'section_courses.sections_per_program_year_id')
            ->leftJoin('temporary_course_offerings', 'section_courses.temporary_course_offering_id', '=', 'temporary_course_offerings.temporary_course_offering_id')
            ->where('sections_per_program_year.academic_year_id', '=', $activeSemester->academic_year_id)
            ->where(function ($query) use ($activeSemester) {
                $query
                    ->where('ca_semesters.semester', '=', $activeSemester->semester)
                    ->orWhere('temporary_course_offerings.semester_id', '=', $activeSemester->semester_id);
            })
            ->select(
                'schedules.schedule_id',
                'schedules.faculty_id',
                'schedules.day',
                'schedules.start_time',
                'schedules.end_time',
                'schedules.room_id',
                'schedules.section_course_id'
            );

        // Step 3: Join faculties with current schedules
        $facultySchedules = DB::table('faculty')
            ->join('users', 'faculty.user_id', '=', 'users.id')
            ->join('faculty_type', 'faculty.faculty_type_id', '=', 'faculty_type.faculty_type_id')
            ->leftJoinSub($schedulesSub, 'current_schedules', function ($join) {
                $join->on('current_schedules.faculty_id', '=', 'faculty.id');
            })
            ->leftJoin('section_courses', 'current_schedules.section_course_id', '=', 'section_courses.section_course_id')
            ->leftJoin('temporary_course_offerings', 'section_courses.temporary_course_offering_id', '=', 'temporary_course_offerings.temporary_course_offering_id')
            ->leftJoin('sections_per_program_year', 'sections_per_program_year.sections_per_program_year_id', '=', 'section_courses.sections_per_program_year_id')
            ->leftJoin('programs', 'programs.program_id', '=', 'sections_per_program_year.program_id')
            ->leftJoin('course_assignments', 'course_assignments.course_assignment_id', '=', 'section_courses.course_assignment_id')
            ->leftJoin('courses as ca_courses', 'ca_courses.course_id', '=', 'course_assignments.course_id')
            ->leftJoin('courses as to_courses', 'to_courses.course_id', '=', 'temporary_course_offerings.course_id')
            ->leftJoin('rooms', 'rooms.room_id', '=', 'current_schedules.room_id')
            ->leftJoin('faculty_schedule_publication', function ($join) use ($activeSemester) {
                $join->on('faculty_schedule_publication.faculty_id', '=', 'faculty.id')
                    ->where('faculty_schedule_publication.academic_year_id', '=', $activeSemester->academic_year_id)
                    ->where('faculty_schedule_publication.semester_id', '=', $activeSemester->semester_id);
            })
            ->select(
                'faculty.id as faculty_id',
                'faculty.is_appeal_enabled',
                'faculty.has_appeal_request',
                'faculty.appeal_start_date',
                'faculty.appeal_end_date',
                'users.id as user_id',
                'users.code as faculty_code',
                'faculty_type.faculty_type',
                'current_schedules.schedule_id',
                'current_schedules.day',
                'current_schedules.start_time',
                'current_schedules.end_time',
                'rooms.room_code',
                'course_assignments.course_assignment_id',
                DB::raw('COALESCE(ca_courses.course_title, to_courses.course_title) as course_title'),
                DB::raw('COALESCE(ca_courses.course_code, to_courses.course_code) as course_code'),
                DB::raw('COALESCE(ca_courses.lec_hours, to_courses.lec_hours) as lec_hours'),
                DB::raw('COALESCE(ca_courses.lab_hours, to_courses.lab_hours) as lab_hours'),
                DB::raw('COALESCE(ca_courses.units, to_courses.units) as units'),
                DB::raw('COALESCE(ca_courses.tuition_hours, to_courses.tuition_hours) as tuition_hours'),
                'temporary_course_offerings.type as offering_type',
                'programs.program_code',
                'programs.program_title',
                'sections_per_program_year.year_level',
                'sections_per_program_year.section_name',
                DB::raw('IFNULL(faculty_schedule_publication.is_published, 0) as is_published')
            )
            ->get();

        // Step 3.1: Collect unique user_ids to fetch User models
        $userIds = $facultySchedules->pluck('user_id')->unique()->toArray();

        // Step 3.2: Fetch User models
        $users = User::whereIn('id', $userIds)->get()->keyBy('id');

        // Step 4: Group the data by faculty and structure schedules
        $faculties = [];

        foreach ($facultySchedules as $schedule) {
            if (!isset($faculties[$schedule->faculty_id])) {
                $faculties[$schedule->faculty_id] = [
                    'faculty_id' => $schedule->faculty_id,
                    'faculty_name' => $users[$schedule->user_id]->formatted_name ?? 'N/A',
                    'faculty_code' => $schedule->faculty_code,
                    'faculty_type' => $schedule->faculty_type,
                    'is_appeal_enabled' => $schedule->is_appeal_enabled,
                    'has_appeal_request' => $schedule->has_appeal_request,
                    'appeal_start_date' => $schedule->appeal_start_date,
                    'appeal_end_date' => $schedule->appeal_end_date,
                    
                    'assigned_units' => 0,
                    'is_published' => 0,
                    'schedules' => [],
                    'tracked_courses' => [],
                ];
            }

            if ($schedule->schedule_id) {
                // Only add units if we haven't counted this course assignment before
                if (!in_array($schedule->course_assignment_id, $faculties[$schedule->faculty_id]['tracked_courses'])) {
                    $faculties[$schedule->faculty_id]['assigned_units'] += $schedule->units;
                    $faculties[$schedule->faculty_id]['tracked_courses'][] = $schedule->course_assignment_id;
                }

                $faculties[$schedule->faculty_id]['is_published'] = $schedule->is_published;
                $faculties[$schedule->faculty_id]['schedules'][] = [
                    'schedule_id' => $schedule->schedule_id,
                    'day' => $schedule->day,
                    'start_time' => $schedule->start_time,
                    'end_time' => $schedule->end_time,
                    'room_code' => $schedule->room_code,
                    'program_code' => $schedule->program_code,
                    'program_title' => $schedule->program_title,
                    'year_level' => $schedule->year_level,
                    'section_name' => $schedule->section_name,
                    'course_details' => [
                        'course_assignment_id' => $schedule->course_assignment_id,
                        'course_title' => $schedule->course_title,
                        'course_code' => $schedule->course_code,
                        'lec' => $schedule->lec_hours,
                        'lab' => $schedule->lab_hours,
                        'units' => $schedule->units,
                        'tuition_hours' => $schedule->tuition_hours,
                        'offering_type' => $schedule->offering_type,
                    ],
                ];
            }
        }

        // Remove the tracking array before sending response
        foreach ($faculties as &$faculty) {
            unset($faculty['tracked_courses']);
        }

        // Step 4.1: Sort the faculties by faculty_name
        $faculties = collect($faculties)->sortBy('faculty_name')->values()->all();

        // Check if active semester differs from faculty view semester
        $facultyViewSemester = DB::table('active_semesters')
            ->where('is_faculty_view', 1)
            ->first();
            
        $isMismatchedSemester = $facultyViewSemester ? 
            ($activeSemester->active_semester_id !== $facultyViewSemester->active_semester_id) : false;

        // Step 5: Structure the response
        return response()->json([
            'faculty_schedule_reports' => [
                'isMismatchedSemester' => $isMismatchedSemester,
                'academic_year_id' => $activeSemester->academic_year_id,
                'year_start' => $activeSemester->year_start,
                'year_end' => $activeSemester->year_end,
                'active_semester_id' => $activeSemester->active_semester_id,
                'semester' => $activeSemester->semester,
                'faculties' => array_values($faculties),
            ],
        ]);
    }

    /**
     * Get Room Schedules Report
     */
    public function getRoomSchedulesReport(Request $request)
    {
        // Step 1: Get active semester - handle request parameter or use current active
        $requestedSemesterId = $request->query('active_semester_id');
        
        $activeSemesterQuery = ActiveSemester::with('academicYear', 'semester');
        
        if ($requestedSemesterId && $requestedSemesterId !== 'null') {
            $activeSemesterQuery->where('active_semester_id', $requestedSemesterId);
        } else {
            $activeSemesterQuery->where('is_active', 1);
        }

        $activeSemester = $activeSemesterQuery->first();

        if (!$activeSemester) {
            return response()->json(['message' => 'No active semester found.'], 404);
        }

        // Step 2: Get room schedules (excluding TBA)
        $roomSchedules = $this->getRoomSchedulesForSemester($activeSemester);

        // Step 3: Get TBA schedules (NULL rooms)
        $tbaSchedules = $this->getTBASchedulesForSemester($activeSemester);

        // Step 4: Cache users from both result sets
        $users = $this->getCachedUsers($roomSchedules, $tbaSchedules);

        // Step 5: Group and format room data
        $rooms = $this->groupRoomSchedules($roomSchedules, $users);
        
        // Step 6: Add TBA entry
        $rooms[] = [
            'room_id' => null,
            'room_code' => 'TBA',
            'location' => null,
            'floor_level' => null,
            'capacity' => null,
            'schedules' => $this->formatScheduleList($tbaSchedules, $users),
        ];

        return response()->json([
            'room_schedule_reports' => [
                'academic_year_id' => $activeSemester->academic_year_id,
                'year_start' => $activeSemester->academicYear->year_start,
                'year_end' => $activeSemester->academicYear->year_end,
                'active_semester_id' => $activeSemester->active_semester_id,
                'semester' => $activeSemester->semester->semester,
                'rooms' => $rooms,
            ],
        ]);
    }

    /**
     * Get room schedules for the active semester (where room_id is not null)
     */
    private function getRoomSchedulesForSemester(ActiveSemester $activeSemester)
    {
        // Get all available rooms, then left join with schedules for this semester
        $schedulesSub = DB::table('schedules')
            ->join('section_courses', 'schedules.section_course_id', '=', 'section_courses.section_course_id')
            ->leftJoin('course_assignments', 'course_assignments.course_assignment_id', '=', 'section_courses.course_assignment_id')
            ->leftJoin('semesters as ca_semesters', 'ca_semesters.semester_id', '=', 'course_assignments.semester_id')
            ->join('sections_per_program_year', 'sections_per_program_year.sections_per_program_year_id', '=', 'section_courses.sections_per_program_year_id')
            ->leftJoin('temporary_course_offerings', 'section_courses.temporary_course_offering_id', '=', 'temporary_course_offerings.temporary_course_offering_id')
            ->leftJoin('faculty', 'schedules.faculty_id', '=', 'faculty.id')
            ->leftJoin('users', 'faculty.user_id', '=', 'users.id')
            ->leftJoin('programs', 'programs.program_id', '=', 'sections_per_program_year.program_id')
            ->leftJoin('courses as ca_courses', 'ca_courses.course_id', '=', 'course_assignments.course_id')
            ->leftJoin('courses as to_courses', 'to_courses.course_id', '=', 'temporary_course_offerings.course_id')
            ->where('sections_per_program_year.academic_year_id', $activeSemester->academic_year_id)
            ->where(function ($query) use ($activeSemester) {
                $query
                    ->where('ca_semesters.semester', '=', $activeSemester->semester->semester)
                    ->orWhere('temporary_course_offerings.semester_id', '=', $activeSemester->semester_id);
            })
            ->whereNotNull('schedules.room_id')
            ->whereNotNull('schedules.day')
            ->whereNotNull('schedules.start_time')
            ->whereNotNull('schedules.end_time')
            ->whereNotNull('schedules.faculty_id')
            ->select(
                'schedules.schedule_id',
                'schedules.room_id',
                'schedules.day',
                'schedules.start_time',
                'schedules.end_time',
                'faculty.user_id',
                'users.code as faculty_code',
                'programs.program_code',
                'programs.program_title',
                'sections_per_program_year.year_level',
                'sections_per_program_year.section_name',
                'course_assignments.course_assignment_id',
                DB::raw('COALESCE(ca_courses.course_title, to_courses.course_title) as course_title'),
                DB::raw('COALESCE(ca_courses.course_code, to_courses.course_code) as course_code'),
                DB::raw('COALESCE(ca_courses.lec_hours, to_courses.lec_hours) as lec'),
                DB::raw('COALESCE(ca_courses.lab_hours, to_courses.lab_hours) as lab'),
                DB::raw('COALESCE(ca_courses.units, to_courses.units) as units'),
                DB::raw('COALESCE(ca_courses.tuition_hours, to_courses.tuition_hours) as tuition_hours'),
                'temporary_course_offerings.type as offering_type'
            );

        // Get all available rooms and left join with schedules
        return DB::table('rooms')
            ->leftJoin('buildings', 'buildings.building_id', '=', 'rooms.building_id')
            ->leftJoinSub($schedulesSub, 'schedules', function ($join) {
                $join->on('schedules.room_id', '=', 'rooms.room_id');
            })
            ->where('rooms.status', 'Available')
            ->select(
                'schedules.schedule_id',
                'rooms.room_id',
                'rooms.room_code',
                'buildings.building_name as location',
                'rooms.floor_level',
                'rooms.capacity',
                'schedules.day',
                'schedules.start_time',
                'schedules.end_time',
                'schedules.user_id',
                'schedules.faculty_code',
                'schedules.program_code',
                'schedules.program_title',
                'schedules.year_level',
                'schedules.section_name',
                'schedules.course_assignment_id',
                'schedules.course_title',
                'schedules.course_code',
                'schedules.lec',
                'schedules.lab',
                'schedules.units',
                'schedules.tuition_hours',
                'schedules.offering_type'
            )
            ->get();
    }

    /**
     * Get TBA schedules for the active semester (where room_id is null)
     */
    private function getTBASchedulesForSemester(ActiveSemester $activeSemester)
    {
        return DB::table('schedules')
            ->join('section_courses', 'schedules.section_course_id', '=', 'section_courses.section_course_id')
            ->leftJoin('course_assignments', 'course_assignments.course_assignment_id', '=', 'section_courses.course_assignment_id')
            ->leftJoin('semesters as ca_semesters', 'ca_semesters.semester_id', '=', 'course_assignments.semester_id')
            ->join('sections_per_program_year', 'sections_per_program_year.sections_per_program_year_id', '=', 'section_courses.sections_per_program_year_id')
            ->leftJoin('temporary_course_offerings', 'section_courses.temporary_course_offering_id', '=', 'temporary_course_offerings.temporary_course_offering_id')
            ->leftJoin('faculty', 'schedules.faculty_id', '=', 'faculty.id')
            ->leftJoin('users', 'faculty.user_id', '=', 'users.id')
            ->leftJoin('programs', 'programs.program_id', '=', 'sections_per_program_year.program_id')
            ->leftJoin('courses as ca_courses', 'ca_courses.course_id', '=', 'course_assignments.course_id')
            ->leftJoin('courses as to_courses', 'to_courses.course_id', '=', 'temporary_course_offerings.course_id')
            ->where('sections_per_program_year.academic_year_id', $activeSemester->academic_year_id)
            ->where(function ($query) use ($activeSemester) {
                $query
                    ->where('ca_semesters.semester', '=', $activeSemester->semester->semester)
                    ->orWhere('temporary_course_offerings.semester_id', '=', $activeSemester->semester_id);
            })
            ->whereNull('schedules.room_id')
            ->whereNotNull('schedules.day')
            ->whereNotNull('schedules.start_time')
            ->whereNotNull('schedules.end_time')
            ->whereNotNull('schedules.faculty_id')
            ->select(
                'schedules.schedule_id',
                'schedules.day',
                'schedules.start_time',
                'schedules.end_time',
                'faculty.user_id',
                'users.code as faculty_code',
                'programs.program_code',
                'programs.program_title',
                'sections_per_program_year.year_level',
                'sections_per_program_year.section_name',
                'course_assignments.course_assignment_id',
                DB::raw('COALESCE(ca_courses.course_title, to_courses.course_title) as course_title'),
                DB::raw('COALESCE(ca_courses.course_code, to_courses.course_code) as course_code'),
                DB::raw('COALESCE(ca_courses.lec_hours, to_courses.lec_hours) as lec'),
                DB::raw('COALESCE(ca_courses.lab_hours, to_courses.lab_hours) as lab'),
                DB::raw('COALESCE(ca_courses.units, to_courses.units) as units'),
                DB::raw('COALESCE(ca_courses.tuition_hours, to_courses.tuition_hours) as tuition_hours'),
                'temporary_course_offerings.type as offering_type'
            )
            ->get();
    }

    /**
     * Cache users from schedule results
     */
    private function getCachedUsers($roomSchedules, $tbaSchedules)
    {
        $userIds = $roomSchedules->pluck('user_id')->merge($tbaSchedules->pluck('user_id'))->filter()->unique()->toArray();
        return User::whereIn('id', $userIds)->get()->keyBy('id');
    }

    /**
     * Group room schedules by room
     */
    private function groupRoomSchedules($schedules, $users)
    {
        $rooms = [];
        foreach ($schedules as $schedule) {
            if (!isset($rooms[$schedule->room_id])) {
                $rooms[$schedule->room_id] = [
                    'room_id' => $schedule->room_id,
                    'room_code' => $schedule->room_code,
                    'location' => $schedule->location,
                    'floor_level' => $schedule->floor_level,
                    'capacity' => $schedule->capacity,
                    'schedules' => [],
                ];
            }

            if ($schedule->schedule_id) {
                $rooms[$schedule->room_id]['schedules'][] = $this->formatScheduleRecord($schedule, $users);
            }
        }
        return array_values($rooms);
    }

    /**
     * Format schedule list
     */
    private function formatScheduleList($schedules, $users)
    {
        return $schedules->filter(fn($s) => $s->schedule_id)
            ->map(fn($s) => $this->formatScheduleRecord($s, $users))
            ->toArray();
    }

    /**
     * Format individual schedule record
     */
    private function formatScheduleRecord($schedule, $users)
    {
        return [
            'schedule_id' => $schedule->schedule_id,
            'day' => $schedule->day,
            'start_time' => $schedule->start_time,
            'end_time' => $schedule->end_time,
            'faculty_name' => $users[$schedule->user_id]->formatted_name ?? 'N/A',
            'faculty_code' => $schedule->faculty_code,
            'program_code' => $schedule->program_code,
            'program_title' => $schedule->program_title,
            'year_level' => $schedule->year_level,
            'section_name' => $schedule->section_name,
            'course_details' => [
                'course_assignment_id' => $schedule->course_assignment_id,
                'course_title' => $schedule->course_title,
                'course_code' => $schedule->course_code,
                'lec' => $schedule->lec,
                'lab' => $schedule->lab,
                'units' => $schedule->units,
                'tuition_hours' => $schedule->tuition_hours,
                'offering_type' => $schedule->offering_type,
            ],
        ];
    }

    /**
     * Get Program Schedules Report
     */
    public function getProgramSchedulesReport(Request $request)
    {
        // Step 1: Retrieve the requested semester or fallback to current active
        $requestedSemesterId = $request->query('active_semester_id');

        $activeSemesterQuery = DB::table('active_semesters')
            ->join('academic_years', 'active_semesters.academic_year_id', '=', 'academic_years.academic_year_id')
            ->join('semesters', 'active_semesters.semester_id', '=', 'semesters.semester_id')
            ->select(
                'active_semesters.active_semester_id',
                'active_semesters.semester_id',
                'academic_years.academic_year_id',
                'academic_years.year_start',
                'academic_years.year_end',
                'semesters.semester'
            );

        if ($requestedSemesterId && $requestedSemesterId !== 'null') {
            $activeSemesterQuery->where('active_semesters.active_semester_id', $requestedSemesterId);
        } else {
            $activeSemesterQuery->where('active_semesters.is_active', 1);
        }

        $activeSemester = $activeSemesterQuery->first();

        if (!$activeSemester) {
            return response()->json(['message' => 'No active semester found.'], 404);
        }

        // Step 2: Prepare a subquery to get schedules (USING ORIGINAL TEXT-BASED JOIN)
        $schedulesSub = DB::table('schedules')
            ->join('section_courses', 'schedules.section_course_id', '=', 'section_courses.section_course_id')
            ->leftJoin('course_assignments', 'course_assignments.course_assignment_id', '=', 'section_courses.course_assignment_id')
            ->leftJoin('semesters as ca_semesters', 'ca_semesters.semester_id', '=', 'course_assignments.semester_id')
            ->join('sections_per_program_year', 'sections_per_program_year.sections_per_program_year_id', '=', 'section_courses.sections_per_program_year_id')
            ->leftJoin('temporary_course_offerings', 'section_courses.temporary_course_offering_id', '=', 'temporary_course_offerings.temporary_course_offering_id')
            ->leftJoin('courses as ca_courses', 'ca_courses.course_id', '=', 'course_assignments.course_id')
            ->leftJoin('courses as to_courses', 'to_courses.course_id', '=', 'temporary_course_offerings.course_id')
            ->where('sections_per_program_year.academic_year_id', '=', $activeSemester->academic_year_id)
            ->where(function ($query) use ($activeSemester) {
                $query
                    ->where('ca_semesters.semester', '=', $activeSemester->semester)
                    ->orWhere('temporary_course_offerings.semester_id', '=', $activeSemester->semester_id);
            })
            ->whereNotNull('schedules.day')
            ->select(
                'schedules.schedule_id',
                'schedules.faculty_id',
                'schedules.room_id',
                'schedules.day',
                'schedules.start_time',
                'schedules.end_time',
                'sections_per_program_year.program_id',
                'sections_per_program_year.year_level',
                'sections_per_program_year.section_name',
                'course_assignments.course_assignment_id',
                DB::raw('COALESCE(ca_courses.course_title, to_courses.course_title) as course_title'),
                DB::raw('COALESCE(ca_courses.course_code, to_courses.course_code) as course_code'),
                DB::raw('COALESCE(ca_courses.lec_hours, to_courses.lec_hours) as lec'),
                DB::raw('COALESCE(ca_courses.lab_hours, to_courses.lab_hours) as lab'),
                DB::raw('COALESCE(ca_courses.units, to_courses.units) as units'),
                DB::raw('COALESCE(ca_courses.tuition_hours, to_courses.tuition_hours) as tuition_hours'),
                'temporary_course_offerings.type as offering_type'
            );

        // Step 3: Join programs with current schedules
        $programSchedules = DB::table('programs')
            ->leftJoinSub($schedulesSub, 'current_schedules', function ($join) {
                $join->on('current_schedules.program_id', '=', 'programs.program_id');
            })
            ->leftJoin('faculty', 'current_schedules.faculty_id', '=', 'faculty.id')
            ->leftJoin('users', 'faculty.user_id', '=', 'users.id')
            ->leftJoin('rooms', 'current_schedules.room_id', '=', 'rooms.room_id')
            ->select(
                'programs.program_id',
                'programs.program_code',
                'programs.program_title',
                'current_schedules.year_level',
                'current_schedules.section_name',
                'current_schedules.schedule_id',
                'current_schedules.day',
                'current_schedules.start_time',
                'current_schedules.end_time',
                'faculty.user_id',
                'users.code as faculty_code',
                'rooms.room_code',
                'current_schedules.course_assignment_id',
                'current_schedules.course_title',
                'current_schedules.course_code',
                'current_schedules.lec',
                'current_schedules.lab',
                'current_schedules.units',
                'current_schedules.tuition_hours',
                'current_schedules.offering_type'
            )
            ->get();

        $userIds = $programSchedules->pluck('user_id')->unique()->filter()->toArray();
        $users = User::whereIn('id', $userIds)->get()->keyBy('id');

        $programs = [];
        foreach ($programSchedules as $schedule) {
            if (!isset($programs[$schedule->program_id])) {
                $programs[$schedule->program_id] = [
                    'program_id' => $schedule->program_id,
                    'program_code' => $schedule->program_code,
                    'program_title' => $schedule->program_title,
                    'year_levels' => [],
                ];
            }

            if ($schedule->schedule_id) {
                if (!isset($programs[$schedule->program_id]['year_levels'][$schedule->year_level])) {
                    $programs[$schedule->program_id]['year_levels'][$schedule->year_level] = [
                        'year_level' => $schedule->year_level,
                        'sections' => [],
                    ];
                }

                if (!isset($programs[$schedule->program_id]['year_levels'][$schedule->year_level]['sections'][$schedule->section_name])) {
                    $programs[$schedule->program_id]['year_levels'][$schedule->year_level]['sections'][$schedule->section_name] = [
                        'section_name' => $schedule->section_name,
                        'schedules' => [],
                    ];
                }

                $facultyName = isset($users[$schedule->user_id]) ? $users[$schedule->user_id]->formatted_name : 'N/A';
                $programs[$schedule->program_id]['year_levels'][$schedule->year_level]['sections'][$schedule->section_name]['schedules'][] = [
                    'schedule_id' => $schedule->schedule_id,
                    'day' => $schedule->day,
                    'start_time' => $schedule->start_time,
                    'end_time' => $schedule->end_time,
                    'faculty_name' => $facultyName,
                    'faculty_code' => $schedule->faculty_code,
                    'room_code' => $schedule->room_code,
                    'course_details' => [
                        'course_assignment_id' => $schedule->course_assignment_id,
                        'course_title' => $schedule->course_title,
                        'course_code' => $schedule->course_code,
                        'lec' => $schedule->lec,
                        'lab' => $schedule->lab,
                        'units' => $schedule->units,
                        'tuition_hours' => $schedule->tuition_hours,
                        'offering_type' => $schedule->offering_type,
                    ],
                ];
            }
        }

        foreach ($programs as &$program) {
            $program['year_levels'] = array_values($program['year_levels']);
            foreach ($program['year_levels'] as &$yearLevel) {
                $yearLevel['sections'] = array_values($yearLevel['sections']);
            }
        }

        return response()->json([
            'programs_schedule_reports' => [
                'academic_year_id' => $activeSemester->academic_year_id,
                'year_start' => $activeSemester->year_start,
                'year_end' => $activeSemester->year_end,
                'active_semester_id' => $activeSemester->active_semester_id,
                'semester' => $activeSemester->semester,
                'programs' => array_values($programs),
            ],
        ]);
    }

    /**
     * Get a single faculty schedule for the current active academic year and semester
     */
    public function getSingleFacultySchedule(Request $request, $faculty_id)

    {
        // Step 1: Validate the faculty_id
        $validator = Validator::make(['faculty_id' => $faculty_id], [
            'faculty_id' => 'required|integer|exists:faculty,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Invalid faculty_id provided.'], 400);
        }

        // Step 2: Get active semester info
        $activeSemester = DB::table('active_semesters')
            ->join('academic_years', 'active_semesters.academic_year_id', '=', 'academic_years.academic_year_id')
            ->join('semesters', 'active_semesters.semester_id', '=', 'semesters.semester_id')
            ->where('active_semesters.is_active', 1)
            ->select(
                'active_semesters.active_semester_id',
                'active_semesters.semester_id',
                'academic_years.academic_year_id',
                'academic_years.year_start',
                'academic_years.year_end',
                'semesters.semester',
                'active_semesters.start_date',
                'active_semesters.end_date'
            )
            ->first();

        if (!$activeSemester) {
            return response()->json(['message' => 'No active semester found.'], 404);
        }

        // Step 3: Get faculty basic info
        $faculty = Faculty::with(['user', 'facultyType'])
            ->where('id', $faculty_id)
            ->first();

        if (!$faculty) {
            return response()->json(['message' => 'Faculty not found.'], 404);
        }

        $facultyData = [
            'faculty_id' => $faculty->id,
            'user_id' => $faculty->user->id,
            'faculty_code' => $faculty->user->code,
            'faculty_type' => $faculty->facultyType->faculty_type,
            'faculty_name' => "{$faculty->user->last_name}, {$faculty->user->first_name}",
        ];

        // Step 4: Prepare the base response
        $response = [
            'is_appeal_enabled' => (bool)$faculty->is_appeal_enabled,
            'has_appeal_request' => (bool)$faculty->has_appeal_request,
            'faculty_schedule' => [
                'academic_year_id' => $activeSemester->academic_year_id,
                'year_start' => $activeSemester->year_start,
                'year_end' => $activeSemester->year_end,
                'active_semester_id' => $activeSemester->active_semester_id,
                'semester' => $activeSemester->semester,
                'start_date' => $activeSemester->start_date,
                'end_date' => $activeSemester->end_date,
                'faculty_id' => $faculty->id,
                'faculty_name' => 'N/A',
                'faculty_code' => $faculty->user->code,
                'faculty_type' => $faculty->facultyType->faculty_type,
                'assigned_units' => 0,
                'total_hours' => 0,
                'is_published' => 0,
                'schedules' => [],
            ],
        ];

        // Step 5: Fetch User model for the faculty
        $user = User::find($faculty->user->id);
        if ($user) {
            $response['faculty_schedule']['faculty_name'] = $user->formatted_name;
        }

        // Step 6: Fetch schedules with publication status
        $facultySchedules = DB::table('schedules')
            ->join('section_courses', 'schedules.section_course_id', '=', 'section_courses.section_course_id')
            ->leftJoin('course_assignments', 'course_assignments.course_assignment_id', '=', 'section_courses.course_assignment_id')
            ->leftJoin('semesters as ca_semesters', 'ca_semesters.semester_id', '=', 'course_assignments.semester_id')
            ->join('sections_per_program_year', 'sections_per_program_year.sections_per_program_year_id', '=', 'section_courses.sections_per_program_year_id')
            ->leftJoin('temporary_course_offerings', 'section_courses.temporary_course_offering_id', '=', 'temporary_course_offerings.temporary_course_offering_id')
            ->leftJoin('courses as ca_courses', 'ca_courses.course_id', '=', 'course_assignments.course_id')
            ->leftJoin('courses as to_courses', 'to_courses.course_id', '=', 'temporary_course_offerings.course_id')
            ->leftJoin('rooms', 'rooms.room_id', '=', 'schedules.room_id')
            ->leftJoin('programs', 'programs.program_id', '=', 'sections_per_program_year.program_id')
            ->leftJoin('faculty_schedule_publication', function ($join) use ($activeSemester) {
                $join->on('faculty_schedule_publication.faculty_id', '=', 'schedules.faculty_id')
                    ->where('faculty_schedule_publication.academic_year_id', '=', $activeSemester->academic_year_id)
                    ->where('faculty_schedule_publication.semester_id', '=', $activeSemester->semester_id);
            })
            ->where('schedules.faculty_id', '=', $faculty->id)
            ->where('sections_per_program_year.academic_year_id', '=', $activeSemester->academic_year_id)
            ->where(function ($query) use ($activeSemester) {
                $query->where('ca_semesters.semester', '=', $activeSemester->semester)
                    ->orWhere('temporary_course_offerings.semester_id', '=', $activeSemester->semester_id);
            })
            ->select(
                'schedules.schedule_id',
                'schedules.day',
                'schedules.start_time',
                'schedules.end_time',
                'rooms.room_code',
                'section_courses.course_assignment_id',
                'section_courses.temporary_course_offering_id',
                DB::raw('COALESCE(ca_courses.course_title, to_courses.course_title) as course_title'),
                DB::raw('COALESCE(ca_courses.course_code, to_courses.course_code) as course_code'),
                DB::raw('COALESCE(ca_courses.lec_hours, to_courses.lec_hours) as lec_hours'),
                DB::raw('COALESCE(ca_courses.lab_hours, to_courses.lab_hours) as lab_hours'),
                DB::raw('COALESCE(ca_courses.units, to_courses.units) as units'),
                DB::raw('COALESCE(ca_courses.tuition_hours, to_courses.tuition_hours) as tuition_hours'),
                'programs.program_code',
                'programs.program_title',
                'sections_per_program_year.year_level',
                'sections_per_program_year.section_name',
                'temporary_course_offerings.type as offering_type',
                DB::raw('IFNULL(faculty_schedule_publication.is_published, 0) as is_published')
            )
            ->get();

        // Step 7: Calculate totals and transform schedules
        $trackedCourses = [];
        $isPublished = false;
        
        foreach ($facultySchedules as $schedule) {
            if ($schedule->is_published == 1) {
                $isPublished = true;
            }

            $courseKey = $schedule->course_assignment_id 
                ? 'ca_' . $schedule->course_assignment_id 
                : 'to_' . $schedule->temporary_course_offering_id;

            if ($courseKey && !in_array($courseKey, $trackedCourses)) {
                $response['faculty_schedule']['assigned_units'] += $schedule->units;
                $response['faculty_schedule']['total_hours'] += $schedule->tuition_hours;
                $trackedCourses[] = $courseKey;
            }
        }

        $response['faculty_schedule']['is_published'] = $isPublished ? 1 : 0;

        // Step 8: Decide whether to include schedule details (Privacy / Access Control)
        $user = $request->user();
        $isAdmin = $user && ($user->role === 'admin' || $user->role === 'superadmin');
        
        // A faculty can see their own schedule only if it is published.
        // Admins can always see any faculty's schedule.
        if ($isPublished || $isAdmin) {
            foreach ($facultySchedules as $schedule) {
                $response['faculty_schedule']['schedules'][] = [
                    'schedule_id' => $schedule->schedule_id,
                    'day' => $schedule->day,
                    'start_time' => $schedule->start_time,
                    'end_time' => $schedule->end_time,
                    'room_code' => $schedule->room_code,
                    'program_code' => $schedule->program_code,
                    'program_title' => $schedule->program_title,
                    'year_level' => $schedule->year_level,
                    'section_name' => $schedule->section_name,
                    'course_details' => [
                        'course_assignment_id' => $schedule->course_assignment_id,
                        'course_title' => $schedule->course_title,
                        'course_code' => $schedule->course_code,
                        'lec' => $schedule->lec_hours,
                        'lab' => $schedule->lab_hours,
                        'units' => $schedule->units,
                        'tuition_hours' => $schedule->tuition_hours,
                        'offering_type' => $schedule->offering_type,
                    ],
                ];
            }
        }
        
        return response()->json($response);
    }

    /**
     * Get a single Faculty Schedule for the current active academic year and semester
     */
    public function getFacultyScheduleHistory($faculty_id, Request $request)
    {
        // Step 1: Validate input
        $validator = Validator::make([
            'faculty_id' => $faculty_id,
            'active_semester_id' => $request->query('active_semester_id')
        ], [
            'faculty_id' => 'required|integer|exists:faculty,id',
            'active_semester_id' => 'required|integer|exists:active_semesters,active_semester_id'
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Invalid input parameters',
                'errors' => $validator->errors()
            ], 400);
        }

        // Step 2: Get semester info for the requested active_semester_id
        $semesterInfo = DB::table('active_semesters')
            ->join('academic_years', 'academic_years.academic_year_id', '=', 'active_semesters.academic_year_id')
            ->join('semesters', 'semesters.semester_id', '=', 'active_semesters.semester_id')
            ->where('active_semesters.active_semester_id', $request->query('active_semester_id'))
            ->select(
                'active_semesters.active_semester_id',
                'active_semesters.academic_year_id',
                'academic_years.year_start',
                'academic_years.year_end',
                'semesters.semester_id',
                'semesters.semester',
                'active_semesters.start_date',
                'active_semesters.end_date'
            )
            ->first();

        if (!$semesterInfo) {
            return response()->json(['message' => 'Semester information not found'], 404);
        }

        // Step 3: Get faculty info
        $faculty = DB::table('faculty')
            ->join('users', 'users.id', '=', 'faculty.user_id')
            ->join('faculty_type', 'faculty_type.faculty_type_id', '=', 'faculty.faculty_type_id')
            ->where('faculty.id', $faculty_id)
            ->select(
                'faculty.id as faculty_id',
                DB::raw("CONCAT(
                    users.last_name, ', ', 
                    users.first_name,
                    CASE WHEN users.middle_name IS NOT NULL THEN CONCAT(' ', users.middle_name) ELSE '' END,
                    CASE WHEN users.suffix_name IS NOT NULL THEN CONCAT(' ', users.suffix_name) ELSE '' END
                ) as faculty_name"),
                'users.code as faculty_code',
                'faculty_type.faculty_type'
            )
            ->first();

        if (!$faculty) {
            return response()->json(['message' => 'Faculty not found'], 404);
        }

        // Step 4: Get schedules with publication status
        $schedules = DB::table('schedules')
            ->join('section_courses', 'schedules.section_course_id', '=', 'section_courses.section_course_id')
            ->leftJoin('course_assignments', 'section_courses.course_assignment_id', '=', 'course_assignments.course_assignment_id')
            ->leftJoin('semesters as ca_semesters', 'ca_semesters.semester_id', '=', 'course_assignments.semester_id')
            ->join('sections_per_program_year', 'section_courses.sections_per_program_year_id', '=', 'sections_per_program_year.sections_per_program_year_id')
            ->leftJoin('temporary_course_offerings', 'section_courses.temporary_course_offering_id', '=', 'temporary_course_offerings.temporary_course_offering_id')
            ->leftJoin('courses as ca_courses', 'ca_courses.course_id', '=', 'course_assignments.course_id')
            ->leftJoin('courses as to_courses', 'to_courses.course_id', '=', 'temporary_course_offerings.course_id')
            ->leftJoin('rooms', 'rooms.room_id', '=', 'schedules.room_id')
            ->leftJoin('programs', 'programs.program_id', '=', 'sections_per_program_year.program_id')
            ->join('faculty_schedule_publication', function ($join) use ($faculty_id, $semesterInfo) {
                $join->on('faculty_schedule_publication.faculty_id', '=', 'schedules.faculty_id')
                    ->where('faculty_schedule_publication.faculty_id', '=', $faculty_id)
                    ->where('faculty_schedule_publication.academic_year_id', '=', $semesterInfo->academic_year_id)
                    ->where('faculty_schedule_publication.semester_id', '=', $semesterInfo->semester_id)
                    ->where('faculty_schedule_publication.is_published', '=', 1);
            })
            ->where('schedules.faculty_id', '=', $faculty_id)
            ->where('sections_per_program_year.academic_year_id', '=', $semesterInfo->academic_year_id)
            ->where(function ($query) use ($semesterInfo) {
                $query->where('ca_semesters.semester', '=', $semesterInfo->semester)
                    ->orWhere('temporary_course_offerings.semester_id', '=', $semesterInfo->semester_id);
            })
            ->select(
                'schedules.schedule_id',
                'schedules.day',
                'schedules.start_time',
                'schedules.end_time',
                'rooms.room_code',
                'section_courses.course_assignment_id',
                'section_courses.temporary_course_offering_id',
                DB::raw('COALESCE(ca_courses.course_title, to_courses.course_title) as course_title'),
                DB::raw('COALESCE(ca_courses.course_code, to_courses.course_code) as course_code'),
                DB::raw('COALESCE(ca_courses.lec_hours, to_courses.lec_hours) as lec_hours'),
                DB::raw('COALESCE(ca_courses.lab_hours, to_courses.lab_hours) as lab_hours'),
                DB::raw('COALESCE(ca_courses.units, to_courses.units) as units'),
                DB::raw('COALESCE(ca_courses.tuition_hours, to_courses.tuition_hours) as tuition_hours'),
                'programs.program_code',
                'programs.program_title',
                'sections_per_program_year.year_level',
                'sections_per_program_year.section_name',
                'temporary_course_offerings.type as offering_type'
            )
            ->get();


        // Step 5: Calculate totals and transform schedules
        $trackedCourses = [];
        $assignedUnits = 0;
        $totalHours = 0;

        foreach ($schedules as $schedule) {
            $courseKey = $schedule->course_assignment_id 
                ? 'ca_' . $schedule->course_assignment_id 
                : 'to_' . $schedule->temporary_course_offering_id;

            if ($courseKey && !isset($trackedCourses[$courseKey])) {
                $assignedUnits += $schedule->units;
                $totalHours += $schedule->tuition_hours;
                $trackedCourses[$courseKey] = true;
            }
        }

        // Step 6: Transform schedules for response
        $transformedSchedules = $schedules->map(function ($schedule) {
            return [
                'schedule_id' => $schedule->schedule_id,
                'day' => $schedule->day,
                'start_time' => $schedule->start_time,
                'end_time' => $schedule->end_time,
                'room_code' => $schedule->room_code,
                'program_code' => $schedule->program_code,
                'program_title' => $schedule->program_title,
                'year_level' => $schedule->year_level,
                'section_name' => $schedule->section_name,
                'course_details' => [
                    'course_assignment_id' => $schedule->course_assignment_id,
                    'temporary_course_offering_id' => $schedule->temporary_course_offering_id,
                    'course_title' => $schedule->course_title,
                    'course_code' => $schedule->course_code,
                    'lec' => $schedule->lec_hours,
                    'lab' => $schedule->lab_hours,
                    'units' => $schedule->units,
                    'tuition_hours' => $schedule->tuition_hours,
                    'offering_type' => $schedule->offering_type,
                ],
            ];
        });

        // Step 7: Prepare and return response
        $response = [
            'faculty_schedule' => [
                'academic_year_id' => $semesterInfo->academic_year_id,
                'year_start' => $semesterInfo->year_start,
                'year_end' => $semesterInfo->year_end,
                'active_semester_id' => $semesterInfo->active_semester_id,
                'semester' => $semesterInfo->semester,
                'start_date' => $semesterInfo->start_date,
                'end_date' => $semesterInfo->end_date,
                'faculty_id' => $faculty->faculty_id,
                'faculty_name' => $faculty->faculty_name,
                'faculty_code' => $faculty->faculty_code,
                'faculty_type' => $faculty->faculty_type,
                'assigned_units' => $assignedUnits,
                'total_hours' => $totalHours,
                'schedules' => $transformedSchedules,
            ],
        ];

        return response()->json($response);
    }

    /**
     * Retrieves academic years and semesters where a faculty had published schedules
     */
    public function getFacultyAcademicYearsHistory($faculty_id)
    {
        $validator = Validator::make(['faculty_id' => $faculty_id], [
            'faculty_id' => 'required|integer|exists:faculty,id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Invalid faculty ID',
                'errors' => $validator->errors()
            ], 400);
        }

        // Get current active semester for exclusion
        $activeSemester = DB::table('active_semesters')
            ->where('is_active', 1)
            ->first();

        if (!$activeSemester) {
            return response()->json([]);
        }

        $currentSemester = DB::table('semesters')
            ->where('semester_id', $activeSemester->semester_id)
            ->first();
            
        if (!$currentSemester) {
            return response()->json([]);
        }

        /**
         * Query to get all academic years and semesters 
         * where a faculty had published schedules  
         */
        $historyData = DB::table('active_semesters as as')
            ->select([
                'as.active_semester_id',
                'as.semester_id',
                'as.academic_year_id',
                'as.start_date',
                'as.end_date',
                DB::raw("CONCAT(ay.year_start, '-', ay.year_end) as academic_year"),
                DB::raw('CASE 
                    WHEN s.semester = 1 THEN "1st Semester"
                    WHEN s.semester = 2 THEN "2nd Semester"
                    WHEN s.semester = 3 THEN "Summer Semester"
                    ELSE "Unknown Semester"
                END as semester_number'),
                's.semester'
            ])
            ->join('academic_years as ay', 'ay.academic_year_id', '=', 'as.academic_year_id')
            ->join('semesters as s', 's.semester_id', '=', 'as.semester_id')
            ->whereExists(function ($query) use ($faculty_id) {
                $query->select(DB::raw(1))
                    ->from('faculty_schedule_publication as fsp')
                    ->where('fsp.faculty_id', $faculty_id)
                    ->where('fsp.is_published', 1)
                    ->whereColumn('fsp.academic_year_id', 'as.academic_year_id')
                    ->whereColumn('fsp.semester_id', 'as.semester_id');
            })
            ->where(function($query) use ($activeSemester, $currentSemester) {
                $query->where('as.academic_year_id', '<', $activeSemester->academic_year_id)
                    ->orWhere(function($q) use ($activeSemester, $currentSemester) {
                        $q->where('as.academic_year_id', '=', $activeSemester->academic_year_id)
                            ->where('s.semester', '<', $currentSemester->semester);
                    });
            })
            ->orderBy('ay.year_start', 'desc')
            ->orderBy('s.semester', 'asc')
            ->get();

        /**
         * Transform and group the flat results into the nested structure 
         * expected by the frontend.
         */
        $groupedHistory = $historyData->groupBy('academic_year_id')->map(function ($items) {
            $first = $items->first();
            
            return [
                'academic_year_id' => $first->academic_year_id,
                'academic_year' => $first->academic_year,
                'semesters' => $items->map(function ($item) {
                    return [
                        'active_semester_id' => $item->active_semester_id,
                        'semester_id' => $item->semester_id,
                        'semester_number' => $item->semester_number,
                        'start_date' => $item->start_date,
                        'end_date' => $item->end_date,
                    ];
                })->values()
            ];
        })->values();

        return response()->json($groupedHistory);
    }

    /**
     * Get overview details for the current active academic year and semester
     */
    public function getOverviewDetails()
    {
        // Step 1: Retrieve the current active semester with academic year details
        $activeSemester = DB::table('active_semesters')
            ->join('academic_years', 'active_semesters.academic_year_id', '=', 'academic_years.academic_year_id')
            ->join('semesters', 'active_semesters.semester_id', '=', 'semesters.semester_id')
            ->where('active_semesters.is_active', 1)
            ->select(
                'active_semesters.active_semester_id',
                'active_semesters.semester_id',
                'academic_years.academic_year_id',
                'academic_years.year_start',
                'academic_years.year_end',
                'semesters.semester'
            )
            ->first();

        if (!$activeSemester) {
            return response()->json(['message' => 'No active semester found.'], 404);
        }

        // Step 2: Count the number of active faculty
        $activeFacultyCount = DB::table('faculty')
            ->join('users', 'faculty.user_id', '=', 'users.id')
            ->where('users.status', 'Active')
            ->count();

        // Step 3: Count the number of active programs in the current academic year
        $activeProgramsCount = DB::table('program_year_level_curricula')
            ->where('academic_year_id', $activeSemester->academic_year_id)
            ->distinct('program_id')
            ->count('program_id');

        // Step 4: Retrieve active curricula used in the current academic year
        $activeCurricula = DB::table('program_year_level_curricula')
            ->join('curricula', 'program_year_level_curricula.curriculum_id', '=', 'curricula.curriculum_id')
            ->where('program_year_level_curricula.academic_year_id', $activeSemester->academic_year_id)
            ->distinct()
            ->select('curricula.curriculum_id', 'curricula.curriculum_year')
            ->get();

        // Step 5: Calculate Preferences Progress
        $preferencesWithEntries = DB::table('preferences_settings')
            ->join('preferences', function ($join) use ($activeSemester) {
                $join->on('preferences.faculty_id', '=', 'preferences_settings.faculty_id')
                    ->where('preferences.active_semester_id', '=', $activeSemester->active_semester_id);
            })
            ->where('preferences_settings.is_enabled', 0)
            ->distinct('preferences_settings.faculty_id')
            ->count('preferences_settings.faculty_id');

        $submittedProperlyCount = $preferencesWithEntries;
        $preferencesProgress = $activeFacultyCount > 0 ? ($submittedProperlyCount / $activeFacultyCount) * 100 : 0;

        // Step 6: Calculate Scheduling Progress
        $schedules = DB::table('schedules')
            ->join('section_courses', 'schedules.section_course_id', '=', 'section_courses.section_course_id')
            ->join('course_assignments', 'section_courses.course_assignment_id', '=', 'course_assignments.course_assignment_id')
            ->join('semesters as ca_semesters', 'ca_semesters.semester_id', '=', 'course_assignments.semester_id')
            ->join('sections_per_program_year', 'section_courses.sections_per_program_year_id', '=', 'sections_per_program_year.sections_per_program_year_id')
            ->where('ca_semesters.semester', '=', $activeSemester->semester)
            ->where('sections_per_program_year.academic_year_id', '=', $activeSemester->academic_year_id)
            ->select('schedules.day', 'schedules.start_time', 'schedules.end_time', 'schedules.faculty_id', 'schedules.room_id')
            ->get();

        $totalSchedules = $schedules->count();
        $totalNullFields = $schedules->reduce(function ($carry, $schedule) {
            return $carry +
                (is_null($schedule->day) ? 1 : 0) +
                (is_null($schedule->start_time) ? 1 : 0) +
                (is_null($schedule->end_time) ? 1 : 0) +
                (is_null($schedule->faculty_id) ? 1 : 0) +
                (is_null($schedule->room_id) ? 1 : 0);
        }, 0);

        $totalPossibleFields = $totalSchedules * 5;
        $schedulingProgress = $totalPossibleFields > 0 ? 100 - ($totalNullFields / $totalPossibleFields * 100) : 100;

        // Step 7: Calculate Room Utilization
        $totalRooms = DB::table('rooms')->count();
        $usedRooms = DB::table('schedules')
            ->join('section_courses', 'schedules.section_course_id', '=', 'section_courses.section_course_id')
            ->join('course_assignments', 'section_courses.course_assignment_id', '=', 'course_assignments.course_assignment_id')
            ->join('semesters as ca_semesters', 'ca_semesters.semester_id', '=', 'course_assignments.semester_id')
            ->join('sections_per_program_year', 'sections_per_program_year.sections_per_program_year_id', '=', 'section_courses.sections_per_program_year_id')
            ->where('ca_semesters.semester', '=', $activeSemester->semester)
            ->where('sections_per_program_year.academic_year_id', '=', $activeSemester->academic_year_id)
            ->distinct('schedules.room_id')
            ->count('schedules.room_id');

        $roomUtilization = $totalRooms > 0 ? ($usedRooms / $totalRooms) * 100 : 0;

        // Step 8: Calculate Published Schedules
        $publishedSchedules = DB::table('faculty_schedule_publication')
            ->join('schedules', 'faculty_schedule_publication.faculty_id', '=', 'schedules.faculty_id')
            ->join('section_courses', 'schedules.section_course_id', '=', 'section_courses.section_course_id')
            ->join('course_assignments', 'section_courses.course_assignment_id', '=', 'course_assignments.course_assignment_id')
            ->join('semesters as ca_semesters', 'ca_semesters.semester_id', '=', 'course_assignments.semester_id')
            ->join('sections_per_program_year', 'section_courses.sections_per_program_year_id', '=', 'sections_per_program_year.sections_per_program_year_id')
            ->where('ca_semesters.semester', '=', $activeSemester->semester)
            ->where('sections_per_program_year.academic_year_id', '=', $activeSemester->academic_year_id)
            ->where('faculty_schedule_publication.is_published', 1)
            ->where('faculty_schedule_publication.academic_year_id', '=', $activeSemester->academic_year_id)
            ->where('faculty_schedule_publication.semester_id', '=', $activeSemester->semester_id)
            ->distinct('faculty_schedule_publication.faculty_id')
            ->count('faculty_schedule_publication.faculty_id');

        $publishProgress = $activeFacultyCount > 0 ? ($publishedSchedules / $activeFacultyCount) * 100 : 0;

        // Step 9: Calculate preferencesSubmissionEnabled
        if ($activeFacultyCount > 0) {
            $preferencesSubmissionEnabled = PreferencesSetting::where('is_enabled', 1)->count() === $activeFacultyCount;
        } else {
            $preferencesSubmissionEnabled = true;
        }

        // Step 10: Count the number of faculty who have at least one schedule
        $facultyWithSchedulesCount = DB::table('schedules')
            ->join('section_courses', 'schedules.section_course_id', '=', 'section_courses.section_course_id')
            ->join('course_assignments', 'section_courses.course_assignment_id', '=', 'course_assignments.course_assignment_id')
            ->join('semesters as ca_semesters', 'ca_semesters.semester_id', '=', 'course_assignments.semester_id')
            ->join('sections_per_program_year', 'section_courses.sections_per_program_year_id', '=', 'sections_per_program_year.sections_per_program_year_id')
            ->where('ca_semesters.semester', '=', $activeSemester->semester)
            ->where('sections_per_program_year.academic_year_id', '=', $activeSemester->academic_year_id)
            ->distinct('schedules.faculty_id')
            ->count('schedules.faculty_id');

        $globalDeadline = DB::table('preferences_settings')
            ->whereNotNull('global_deadline')
            ->value('global_deadline');

        $globalStartDate = DB::table('preferences_settings')
            ->whereNotNull('global_start_date')
            ->value('global_start_date');

        // Check if active semester differs from faculty view semester
        $facultyViewSemester = DB::table('active_semesters')
            ->where('is_faculty_view', 1)
            ->first();
            
        $isMismatchedSemester = $facultyViewSemester ? 
            ($activeSemester->active_semester_id !== $facultyViewSemester->active_semester_id) : false;

        // Step 11: Structure the response with the new field
        return response()->json([
            'isMismatchedSemester' => $isMismatchedSemester,
            'activeAcademicYear' => "{$activeSemester->year_start}-{$activeSemester->year_end}",
            'activeSemester' => $this->getSemesterLabel($activeSemester->semester),
            'activeFacultyCount' => $activeFacultyCount,
            'activeProgramsCount' => $activeProgramsCount,
            'activeCurricula' => $activeCurricula,
            'preferencesProgress' => round($preferencesProgress, 0),
            'schedulingProgress' => round($schedulingProgress, 0),
            'roomUtilization' => round($roomUtilization, 0),
            'publishProgress' => round($publishProgress, 0),
            'preferencesSubmissionEnabled' => $preferencesSubmissionEnabled,
            'facultyWithSchedulesCount' => $facultyWithSchedulesCount,
            'global_deadline' => $globalDeadline,
            'global_start_date' => $globalStartDate,
        ]);
    }

    /**
     * Get the semester label
     */
    private function getSemesterLabel($semesterNumber)
    {
        switch ($semesterNumber) {
            case 1:
                return '1st Semester';
            case 2:
                return '2nd Semester';
            case 3:
                return 'Summer Semester';
            default:
                return 'Unknown Semester';
        }
    }

    /**
     * Get the current active academic year in 'YYYY-YYYY' format.
     */
    private function getCurrentAcademicYear()
    {
        $activeSemester = ActiveSemester::with('academicYear')->where('is_active', 1)->first();
        if ($activeSemester && $activeSemester->academicYear) {
            return $activeSemester->academicYear->year_start . '-' . $activeSemester->academicYear->year_end;
        }
        return 'N/A';
    }

    /**
     * Get all active semesters/terms for the dropdown filter
     */
    public function getAllTermsForDropdown()
    {
        $terms = DB::table('active_semesters')
            ->join('academic_years', 'active_semesters.academic_year_id', '=', 'academic_years.academic_year_id')
            ->join('semesters', 'active_semesters.semester_id', '=', 'semesters.semester_id')
            ->select(
                'active_semesters.active_semester_id',
                'academic_years.year_start',
                'academic_years.year_end',
                'semesters.semester',
                'active_semesters.is_active'
            )
            ->orderBy('academic_years.year_start', 'desc')
            ->orderBy('semesters.semester', 'desc')
            ->get();

        return response()->json($terms);
    }
}
