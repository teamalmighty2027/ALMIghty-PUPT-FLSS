<?php

namespace App\Http\Controllers;

use App\Models\Schedule;
use App\Models\Faculty;
use App\Models\SectionCourse;
use App\Models\Room;
use App\Models\User;
use App\Models\Curriculum;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class ScheduleController extends Controller
{
    private $sectionCoursesCache = [];
    private $schedulesCache = [];
    private $facultyCache = [];
    private $roomsCache = [];
    private $curriculumElectivesCache = [];
    private $electivesCache = [];
    /**
     * Fetches schedules for a historical (non-active) academic year and semester.
     */
    public function getHistoricalSchedules(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'academic_year_id' => 'required|integer|exists:academic_years,academic_year_id',
            'semester_id' => 'required|integer|exists:semesters,semester_id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation Error',
                'errors' => $validator->errors(),
            ], 422);
        }

        $academicYearId = $request->input('academic_year_id');
        $semesterId = $request->input('semester_id');

        // Fetch all assigned courses for the specified semester and academic year
        $assignedCourses = Curriculum::from('curricula as c')
            ->select(
                'p.program_id',
                'p.program_code',
                'p.program_title',
                'cp.curricula_program_id',
                'c.curriculum_id',
                'c.curriculum_year',
                'yl.year_level_id',
                'yl.year as year_level',
                's.semester_id',
                's.semester',
                'ca.course_assignment_id',
                'co.course_id',
                'co.course_code',
                'co.course_title',
                'co.lec_hours',
                'co.lab_hours',
                'co.units',
                'co.tuition_hours',
                'pylc.academic_year_id'
            )
            ->join('curricula_program as cp', function ($join) {
                $join->on('c.curriculum_id', '=', 'cp.curriculum_id')
                    ->whereIn('c.status', ['Active']);
            })
            ->join('programs as p', function ($join) {
                $join->on('cp.program_id', '=', 'p.program_id')
                    ->where('p.status', 'Active');
            })
            ->join('year_levels as yl', 'cp.curricula_program_id', '=', 'yl.curricula_program_id')
            ->join('semesters as s', 'yl.year_level_id', '=', 's.year_level_id')
            ->join('program_year_level_curricula as pylc', function ($join) {
                $join->on('pylc.program_id', '=', 'p.program_id')
                    ->on('pylc.year_level', '=', 'yl.year')
                    ->on('pylc.curriculum_id', '=', 'c.curriculum_id');
            })
            ->leftJoin('course_assignments as ca', function ($join) {
                $join->on('ca.curricula_program_id', '=', 'cp.curricula_program_id')
                    ->on('ca.semester_id', '=', 's.semester_id');
            })
            ->leftJoin('courses as co', function ($join) {
                $join->on('ca.course_id', '=', 'co.course_id')
                    ->orderBy('co.course_code');
            })
            ->where('s.semester', $semesterId)
            ->where('pylc.academic_year_id', $academicYearId)
            ->orderBy('p.program_id')
            ->orderBy('yl.year')
            ->orderBy('s.semester')
            ->orderBy('co.course_code')
            ->get();

        // PRELOAD SECTIONS: Group by program_id and year_level
        $allSections = DB::table('sections_per_program_year')
            ->where('academic_year_id', $academicYearId)
            ->get()
            ->groupBy(function ($sec) {
                return $sec->program_id . '-' . $sec->year_level;
            });

        // PRELOAD SECTION COURSES & SCHEDULES:
        $courseAssignmentIds = $assignedCourses->pluck('course_assignment_id')->filter()->unique()->toArray();
        $sectionCoursesData = SectionCourse::whereIn('course_assignment_id', $courseAssignmentIds)
            ->with([
                'schedule.faculty.user',
                'schedule.room'
            ])
            ->get()
            ->groupBy(function ($sc) {
                return $sc->sections_per_program_year_id . '-' . $sc->course_assignment_id;
            });

        $response = [];

        foreach ($assignedCourses as $row) {
            $programIndex = $this->findOrCreateProgram($response, $row);
            $yearLevelIndex = $this->findOrCreateYearLevel($response[$programIndex]['year_levels'], $row);
            $semesterIndex = $this->findOrCreateSemester($response[$programIndex]['year_levels'][$yearLevelIndex]['semesters'], $row);

            $key = $row->program_id . '-' . $row->year_level;
            $sections = $allSections->get($key, []);

            foreach ($sections as $section) {
                $this->assignHistoricalCourseToSectionAndSchedule($row, $section, $response[$programIndex]['year_levels'][$yearLevelIndex]['semesters'][$semesterIndex]['sections'], $sectionCoursesData);
            }
        }

        return response()->json([
            'academic_year_id' => $academicYearId,
            'semester_id' => $semesterId,
            'programs' => $response,
        ]);
    }

    /**
     * Optimized assignment using preloaded data
     */
    private function assignHistoricalCourseToSectionAndSchedule(
      $row, $section, &$sections, $sectionCoursesData
    ) {
        if (is_null($row->course_assignment_id)) {
            return;
        }

        $sectionIndex = $this->findOrCreateSection($sections, $section);

        $key = $section->sections_per_program_year_id . '-' . $row->course_assignment_id;
        $sectionCourses = $sectionCoursesData->get($key, []);

        foreach ($sectionCourses as $section_course) {
            $existingSchedule = $section_course->schedule;

            if (!$existingSchedule) {
                continue;
            }

            $facultyName = 'Not set';
            $facultyEmail = null;
            if ($existingSchedule->faculty) {
                $user = $existingSchedule->faculty->user;
                if ($user) {
                    $facultyName = $user->formatted_name;
                    $facultyEmail = $user->email;
                }
            }

            $room = $existingSchedule->room;

            if (!isset($sections[$sectionIndex]['courses'])) {
                $sections[$sectionIndex]['courses'] = [];
            }

            $sections[$sectionIndex]['courses'][] = [
                'course_id' => $row->course_id,
                'course_code' => $row->course_code,
                'course_title' => $row->course_title,
                'lec_hours' => $row->lec_hours,
                'lab_hours' => $row->lab_hours,
                'units' => $row->units,
                'tuition_hours' => $row->tuition_hours,
                'schedule' => [
                    'schedule_id' => $existingSchedule->schedule_id ?? null,
                    'day' => $existingSchedule->day ?? 'Not set',
                    'start_time' => $existingSchedule->start_time ?? 'Not set',
                    'end_time' => $existingSchedule->end_time ?? 'Not set',
                    'room_id' => $existingSchedule->room_id ?? null,
                    'elective_id' => $existingSchedule->elective_id ?? null,
                ],
                'faculty_id' => $existingSchedule->faculty_id ?? null,
                'faculty_email' => $facultyEmail,
                'professor' => $facultyName,
                'room' => [
                    'room_id' => $room ? $room->room_id : null,
                    'room_code' => $room ? $room->room_code : 'Not set',
                ],
                'section_course_id' => $section_course->section_course_id,
                'is_copy' => $section_course->is_copy,
            ];
        }
    }

    /**
     * Populates schedules for the active semester.
     */
    public function populateSchedules()
    {
        $activeSemester = DB::table('active_semesters')
            ->where('is_active', 1)
            ->first();

        if (!$activeSemester) {
            return response()->json(['message' => 'No active semester found'], 404);
        }

        $activeAcademicYearId = $activeSemester->academic_year_id;

        // Populate database query caches to eliminate N+1 queries
        $this->sectionCoursesCache = DB::table('section_courses as sc')
            ->join(
                'sections_per_program_year as sp',
                'sc.sections_per_program_year_id',
                '=',
                'sp.sections_per_program_year_id'
            )
            ->where('sp.academic_year_id', $activeAcademicYearId)
            ->select(
                'sc.section_course_id',
                'sc.sections_per_program_year_id',
                'sc.course_assignment_id',
                'sc.is_copy'
            )
            ->get()
            ->groupBy(function ($item) {
                return $item->sections_per_program_year_id . '-'
                     . $item->course_assignment_id;
            });

        $this->schedulesCache = DB::table('schedules as s')
            ->join(
                'section_courses as sc',
                's.section_course_id',
                '=',
                'sc.section_course_id'
            )
            ->join(
                'sections_per_program_year as sp',
                'sc.sections_per_program_year_id',
                '=',
                'sp.sections_per_program_year_id'
            )
            ->where('sp.academic_year_id', $activeAcademicYearId)
            ->select('s.*')
            ->get()
            ->keyBy('section_course_id');

        $this->facultyCache = DB::table('faculty')
            ->join('users', 'faculty.user_id', '=', 'users.id')
            ->select(
                'faculty.id',
                'users.id as user_id',
                'users.email as faculty_email',
                'users.first_name',
                'users.middle_name',
                'users.last_name',
                'users.suffix_name'
            )
            ->get()
            ->keyBy('id');

        $this->roomsCache = DB::table('rooms')
            ->get()
            ->keyBy('room_id');

        $this->curriculumElectivesCache = DB::table('curriculum_electives as ce')
            ->join(
                'electives as e',
                'ce.selected_elective_id',
                '=',
                'e.elective_id'
            )
            ->where(function ($q) use ($activeAcademicYearId) {
                $q->where('ce.academic_year_id', $activeAcademicYearId)
                  ->orWhereNull('ce.academic_year_id');
            })
            ->select(
                'ce.curriculum_id',
                'ce.program_id',
                'ce.year_level',
                'ce.semester_id',
                'e.elective_id',
                'e.elective_slot_name',
                'e.course_title',
                'e.course_code',
                'ce.academic_year_id'
            )
            ->get();

        $this->electivesCache = DB::table('electives')
            ->select(
                'elective_id',
                'elective_slot_name',
                'course_title',
                'course_code'
            )
            ->get()
            ->keyBy('elective_id');

        $allSections = DB::table('sections_per_program_year')
            ->where('academic_year_id', $activeAcademicYearId)
            ->get()
            ->groupBy(function ($item) {
                return $item->program_id . '-' . $item->year_level;
            });

        // Fetch all assigned courses for the active semester and academic year
        $assignedCourses = DB::table('curricula as c')
            ->select(
                'p.program_id',
                'p.program_code',
                'p.program_title',
                'cp.curricula_program_id',
                'c.curriculum_id',
                'c.curriculum_year',
                'yl.year_level_id',
                'yl.year as year_level',
                's.semester_id',
                's.semester',
                'ca.course_assignment_id',
                'co.course_id',
                'co.course_code',
                'co.course_title',
                'co.lec_hours',
                'co.lab_hours',
                'co.units',
                'co.tuition_hours',
                'pylc.academic_year_id'
            )
            ->join('curricula_program as cp', function ($join) {
                $join->on('c.curriculum_id', '=', 'cp.curriculum_id')
                    ->whereIn('c.status', ['Active']);
            })
            ->join('programs as p', function ($join) {
                $join->on('cp.program_id', '=', 'p.program_id')
                    ->where('p.status', 'Active');
            })
            ->join('year_levels as yl', 'cp.curricula_program_id', '=', 'yl.curricula_program_id')
            ->join('semesters as s', 'yl.year_level_id', '=', 's.year_level_id')
            ->join('program_year_level_curricula as pylc', function ($join) {
                $join->on('pylc.program_id', '=', 'p.program_id')
                    ->on('pylc.year_level', '=', 'yl.year')
                    ->on('pylc.curriculum_id', '=', 'c.curriculum_id');
            })
            ->leftJoin('course_assignments as ca', function ($join) {
                $join->on('ca.curricula_program_id', '=', 'cp.curricula_program_id')
                    ->on('ca.semester_id', '=', 's.semester_id');
            })
            ->leftJoin('courses as co', function ($join) {
                $join->on('ca.course_id', '=', 'co.course_id')
                    ->orderBy('co.course_code');
            })
            ->where('s.semester', $activeSemester->semester_id)
            ->where('pylc.academic_year_id', $activeAcademicYearId)
            ->orderBy('p.program_id')
            ->orderBy('yl.year')
            ->orderBy('s.semester')
            ->orderBy('co.course_code')
            ->get();

        $response = [];

        foreach ($assignedCourses as $row) {
            // Organize data hierarchically: Program -> Year Level -> Semester -> Sections -> Courses
            $programIndex = $this->findOrCreateProgram($response, $row);
            $yearLevelIndex = $this->findOrCreateYearLevel(
                $response[$programIndex]['year_levels'],
                $row
            );
            $semesterIndex = $this->findOrCreateSemester(
                $response[$programIndex]['year_levels'][$yearLevelIndex]['semesters'],
                $row
            );

            $cacheKey = $row->program_id . '-' . $row->year_level;
            $sections = $allSections->get($cacheKey, []);

            foreach ($sections as $section) {
                // Ensure section_courses entry exists for each assigned course
                $this->ensureSectionCourseExists($row, $section);

                // Now assign the course to each section with a specific schedule
                $this->assignCourseToSectionAndSchedule(
                    $row,
                    $section,
                    $response[$programIndex]['year_levels'][$yearLevelIndex]
                             ['semesters'][$semesterIndex]['sections'],
                    $activeAcademicYearId
                );
            }
        }

        $this->appendTemporaryOfferings($response, $activeAcademicYearId, $activeSemester->semester_id);

        // Determine if submission is enabled by checking `is_enabled` in `preferences_settings`
        $isSubmissionEnabled = DB::table('preferences_settings')
            ->where('is_enabled', 1)
            ->exists() ? 1 : 0;

        return response()->json([
            'active_semester_id' => $activeSemester->active_semester_id,
            'academic_year_id' => $activeAcademicYearId,
            'semester_id' => $activeSemester->semester_id,
            'is_submission_enabled' => $isSubmissionEnabled,
            'programs' => $response,
        ]);
    }

    /**
     * Duplicates a course assignment.
     */
    public function duplicateCourse(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'section_course_id' => 'required|exists:section_courses,section_course_id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation Error',
                'errors' => $validator->errors(),
            ], 422);
        }

        $originalSectionCourseId = $request->input('section_course_id');

        // Fetch the original section_course
        $originalSectionCourse = DB::table('section_courses')->where('section_course_id', $originalSectionCourseId)->first();

        if (!$originalSectionCourse) {
            return response()->json(['message' => 'Original section course not found'], 404);
        }

        // Prevent duplicating a course copy
        if ($originalSectionCourse->is_copy) {
            return response()->json(['message' => 'Cannot duplicate a copied course'], 400);
        }

        // Duplicate the section_course with is_copy = 1
        $newSectionCourseId = DB::table('section_courses')->insertGetId([
            'sections_per_program_year_id' => $originalSectionCourse->sections_per_program_year_id,
            'course_assignment_id' => $originalSectionCourse->course_assignment_id,
            'temporary_course_offering_id' => $originalSectionCourse->temporary_course_offering_id,
            'is_copy' => 1, // Mark as copy
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Fetch original schedule to carry over day/time/professor
        $originalSchedule = DB::table('schedules')
            ->where(
                'section_course_id',
                $originalSectionCourseId
            )
            ->first();

        // Create a new schedule copying values, room is null
        $newScheduleId = DB::table('schedules')->insertGetId([
            'section_course_id' => $newSectionCourseId,
            'day' => $originalSchedule->day ?? null,
            'start_time' => $originalSchedule->start_time ?? null,
            'end_time' => $originalSchedule->end_time ?? null,
            'faculty_id' => $originalSchedule->faculty_id ?? null,
            'room_id' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Resolve faculty name for response payload
        $facultyName = 'Not set';
        $facultyId = $originalSchedule->faculty_id ?? null;
        $facultyEmail = null;

        if ($facultyId) {
            $faculty = Faculty::with('user')->find($facultyId);

            if ($faculty) {
                $user = $faculty->user;

                if ($user) {
                    $facultyName = $user->last_name . ', '
                        . $user->first_name;

                    if ($user->middle_name) {
                        $facultyName .= ' ' . $user->middle_name;
                    }

                    if ($user->suffix_name) {
                        $facultyName .= ' ' . $user->suffix_name;
                    }

                    $facultyEmail = $user->email;
                }
            }
        }

        // Fetch course details
        $temporaryMeta = null;

        if (!is_null($originalSectionCourse->course_assignment_id)) {
            $course = DB::table('course_assignments as ca')
                ->join('courses as co', 'ca.course_id', '=', 'co.course_id')
                ->where('ca.course_assignment_id', $originalSectionCourse->course_assignment_id)
                ->select('co.course_id', 'co.course_code', 'co.course_title', 'co.lec_hours', 'co.lab_hours', 'co.units', 'co.tuition_hours')
                ->first();
        } else if (!is_null($originalSectionCourse->temporary_course_offering_id)) {
            $temporaryMeta = DB::table('temporary_course_offerings as t')
                ->join('courses as co', 't.course_id', '=', 'co.course_id')
                ->where(
                    't.temporary_course_offering_id',
                    $originalSectionCourse->temporary_course_offering_id
                )
                ->select(
                    'co.course_id',
                    'co.course_code',
                    'co.course_title',
                    'co.lec_hours',
                    'co.lab_hours',
                    'co.units',
                    'co.tuition_hours',
                    't.type',
                    't.status',
                    't.bridging_course_id'
                )
                ->first();
            $course = $temporaryMeta;
        } else {
            return response()->json(['message' => 'Course assignment data missing'], 400);
        }

        if (!$course) {
            return response()->json(['message' => 'Course details not found'], 404);
        }

        $temporaryType = $temporaryMeta ? $temporaryMeta->type : null;
        $temporaryStatus = $temporaryMeta ? $temporaryMeta->status : null;
        $petitionRequired = $temporaryType ? in_array($temporaryType, ['petition', 'tutorial'], true) : false;

        // Prepare the response
        $response = [
            'section_course_id' => $newSectionCourseId,
            'is_copy' => 1,
            'course_id' => $course->course_id,
            'course_code' => $course->course_code,
            'course_title' => $course->course_title,
            'lec_hours' => $course->lec_hours,
            'lab_hours' => $course->lab_hours,
            'units' => $course->units,
            'tuition_hours' => $course->tuition_hours,
            'temporary_course_offering_id' => $originalSectionCourse->temporary_course_offering_id,
            'is_temporary' => !is_null($originalSectionCourse->temporary_course_offering_id),
            'temporary_type' => $temporaryType,
            'temporary_status' => $temporaryStatus,
            'petition_required' => $petitionRequired,
            'bridging_course_id' => $temporaryMeta
                ? $temporaryMeta->bridging_course_id
                : null,
            'schedule' => [
                'schedule_id' => $newScheduleId,
                'day' => $originalSchedule->day ?? 'Not set',
                'start_time' => $originalSchedule->start_time ?? null,
                'end_time' => $originalSchedule->end_time ?? null,
                'elective_id' => null,
            ],
            'professor' => $facultyName,
            'faculty_id' => $facultyId,
            'faculty_email' => $facultyEmail,
            'room' => [
                'room_id' => null,
                'room_code' => 'Not set',
            ],
        ];

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Course Duplicated
        // ═══════════════════════════════════════════════════════
        AuditLogger::logCreate(
            model: 'SectionCourse',
            modelId: $newSectionCourseId,
            data: [
                'section_course_id' => $newSectionCourseId,
                'course_code' => $course->course_code,
                'is_copy' => 1
            ],
            description: "Duplicated course: {$course->course_code} (copy)"
        );

        return response()->json([
            'message' => 'Course duplicated successfully',
            'course' => $response,
        ], 201);
    }

    /**
     * Removes a duplicated course.
     */
    public function removeDuplicateCourse(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'section_course_id' => 'required|exists:section_courses,section_course_id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation Error',
                'errors' => $validator->errors(),
            ], 422);
        }

        $sectionCourseId = $request->input('section_course_id');

        // Fetch the section_course
        $sectionCourse = DB::table('section_courses')->where('section_course_id', $sectionCourseId)->first();

        if (!$sectionCourse) {
            return response()->json(['message' => 'Section course not found'], 404);
        }

        // Ensure it's a copy
        if (!$sectionCourse->is_copy) {
            return response()->json(['message' => 'Cannot remove original course'], 400);
        }

        // Fetch info for logging
        $courseInfo = null;

        if (!is_null($sectionCourse->course_assignment_id)) {
            $courseInfo = DB::table('section_courses')
                ->join('course_assignments', 'section_courses.course_assignment_id', '=', 'course_assignments.course_assignment_id')
                ->join('courses', 'course_assignments.course_id', '=', 'courses.course_id')
                ->where('section_courses.section_course_id', $sectionCourseId)
                ->select('courses.course_code')
                ->first();
        } else if (!is_null($sectionCourse->temporary_course_offering_id)) {
            $courseInfo = DB::table('temporary_course_offerings as t')
                ->join('courses as co', 't.course_id', '=', 'co.course_id')
                ->where('t.temporary_course_offering_id', $sectionCourse->temporary_course_offering_id)
                ->select('co.course_code')
                ->first();
        }

        // Delete the schedule(s) associated with this section_course
        DB::table('schedules')->where('section_course_id', $sectionCourseId)->delete();

        // Delete the section_course
        DB::table('section_courses')->where('section_course_id', $sectionCourseId)->delete();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Duplicate Course Removed
        // ═══════════════════════════════════════════════════════
        AuditLogger::logDelete(
            model: 'SectionCourse',
            modelId: $sectionCourseId,
            data: (array)$sectionCourse,
            description: "Removed duplicate course: " . ($courseInfo->course_code ?? "Unknown")
        );

        return response()->json(['message' => 'Copied course removed successfully'], 200);
    }

    /**
     * Assigns or updates a schedule.
     */
    public function assignSchedule(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'schedule_id' => 'required|exists:schedules,schedule_id',
            'faculty_id' => 'nullable|exists:faculty,id',
            'room_id' => 'nullable|exists:rooms,room_id',
            'day' => 'nullable|string',
            'start_time' => 'nullable|string',
            'end_time' => 'nullable|string',
            'elective_id' => 'nullable|exists:electives,elective_id',
            'assignment_type_id' => 'nullable|integer|exists:assignment_types,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Invalid input parameters', 'errors' => $validator->errors()], 400);
        }

        $activeSemester = DB::table('active_semesters')
            ->where('is_active', 1)
            ->first();

        if (!$activeSemester) {
            return response()->json(['message' => 'No active semester found'], 404);
        }

        DB::beginTransaction();
        try {
            $schedule = Schedule::where('schedule_id', $request->schedule_id)
                ->with(['faculty.user' => function ($query) {
                    $query->select('id', 'email', 'first_name', 'last_name', 'middle_name', 'suffix_name')
                        ->where('status', 'Active');
                }])
                ->with(['room' => function ($query) {
                    $query->select('room_id', 'room_code', 'status')
                        ->where('status', 'Available');
                }])
                ->first();

            // 1. SAVE OLD DATA
            $oldData = [
                'faculty_id' => $schedule->faculty_id,
                'room_id'    => $schedule->room_id,
                'day'        => $schedule->day,
                'start_time' => $schedule->start_time,
                'end_time'   => $schedule->end_time,
                'elective_id' => $schedule->elective_id,
                'assignment_type_id' => $schedule->assignment_type_id ?? null,
            ];

            // 2. APPLY UPDATES
            $schedule->faculty_id = $request->input('faculty_id');
            $schedule->room_id = $request->input('room_id');
            $schedule->day = $request->input('day');
            $schedule->start_time = $request->input('start_time');
            $schedule->end_time = $request->input('end_time');
            $schedule->elective_id = $request->input('elective_id');
            $schedule->assignment_type_id = $request->input('assignment_type_id');
            
            // 3. TRACK HUMAN READABLE CHANGES
            $changes = [];

            if ($oldData['faculty_id'] != $schedule->faculty_id) {
                // Fetch actual names
                $oldFacName = $oldData['faculty_id'] ? \App\Models\User::whereHas('faculty', fn($q) => $q->where('id', $oldData['faculty_id']))->first()->formatted_name ?? "ID {$oldData['faculty_id']}" : "None";
                $newFacName = $schedule->faculty_id ? \App\Models\User::whereHas('faculty', fn($q) => $q->where('id', $schedule->faculty_id))->first()->formatted_name ?? "ID {$schedule->faculty_id}" : "None";
                
                $changes[] = "Faculty: {$oldFacName} → {$newFacName}";
            }

            if ($oldData['room_id'] != $schedule->room_id) {
                // Fetch actual room codes
                $oldRoom = $oldData['room_id'] ? \App\Models\Room::find($oldData['room_id'])->room_code ?? "ID {$oldData['room_id']}" : "None";
                $newRoom = $schedule->room_id ? \App\Models\Room::find($schedule->room_id)->room_code ?? "ID {$schedule->room_id}" : "None";
                
                $changes[] = "Room: {$oldRoom} → {$newRoom}";
            }

            if ($oldData['day'] != $schedule->day) {
                $oldDay = $oldData['day'] ?: "None";
                $newDay = $schedule->day ?: "None";
                $changes[] = "Day: {$oldDay} → {$newDay}";
            }

            if ($oldData['start_time'] != $schedule->start_time || $oldData['end_time'] != $schedule->end_time) {
                $oldTime = ($oldData['start_time'] && $oldData['end_time']) ? "{$oldData['start_time']} - {$oldData['end_time']}" : "None";
                $newTime = ($schedule->start_time && $schedule->end_time) ? "{$schedule->start_time} - {$schedule->end_time}" : "None";
                $changes[] = "Time: {$oldTime} → {$newTime}";
            }

            if ($oldData['elective_id'] != $schedule->elective_id) {
                $oldElective = $oldData['elective_id']
                    ? DB::table('electives')
                        ->where('elective_id', $oldData['elective_id'])
                        ->select('course_code', 'course_title')
                        ->first()
                    : null;
                $newElective = $schedule->elective_id
                    ? DB::table('electives')
                        ->where('elective_id', $schedule->elective_id)
                        ->select('course_code', 'course_title')
                        ->first()
                    : null;

                $oldElectiveLabel = $oldElective
                    ? "{$oldElective->course_code} - {$oldElective->course_title}"
                    : 'None';
                $newElectiveLabel = $newElective
                    ? "{$newElective->course_code} - {$newElective->course_title}"
                    : 'None';

                $changes[] = "Elective: {$oldElectiveLabel} → {$newElectiveLabel}";
            }

            if (($oldData['assignment_type_id'] ?? null) != ($schedule->assignment_type_id ?? null)) {
                $oldName = $oldData['assignment_type_id']
                    ? DB::table('assignment_types')->where('id', $oldData['assignment_type_id'])->value('name')
                    : 'None';
                $newName = $schedule->assignment_type_id
                    ? DB::table('assignment_types')->where('id', $schedule->assignment_type_id)->value('name')
                    : 'None';

                $changes[] = "Assignment Type: {$oldName} → {$newName}";
            }

            // NOW the guard runs after all checks are complete:
            if (empty($changes)) {
                DB::rollBack();
                return response()->json(['message' => 'No changes detected'], 422);
            }

            $schedule->save();
            DB::commit();

            // ═══════════════════════════════════════════════════════
            // AUDIT LOG: Schedule Assigned/Updated
            // ═══════════════════════════════════════════════════════
            $courseInfo = null;

            if ($schedule->sectionCourse) {
                if ($schedule->sectionCourse->courseAssignment) {
                    $courseInfo = $schedule->sectionCourse->courseAssignment->course;
                } else if ($schedule->sectionCourse->temporaryCourseOffering) {
                    $courseInfo = $schedule->sectionCourse->temporaryCourseOffering->course;
                }
            }
            $courseCode = $courseInfo ? $courseInfo->course_code : "Schedule #{$schedule->schedule_id}";
            $changesSummary = implode(', ', $changes);

            AuditLogger::logUpdate(
                model: 'Schedule',
                modelId: $schedule->schedule_id,
                oldData: $oldData,
                newData: $schedule->toArray(),
                description: "Updated {$courseCode} Schedule - {$changesSummary}"
            );

            $schedule->load(['faculty.user', 'room']);

            return response()->json([
                'message' => 'Schedule assigned successfully',
                'schedule' => $schedule,
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to assign schedule', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Updates the assignment type of a schedule.
     */
    public function updateAssignmentType(Request $request, $scheduleId)
    {
        $validator = Validator::make($request->all(), [
            // Changed from a hardcoded string to checking the new database table.
            // Made it nullable so users can revert back to the empty "Select Load Type" state.
            'assignment_type_id' => 'nullable|integer|exists:assignment_types,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validation Error', 'errors' => $validator->errors()], 422);
        }

        $schedule = Schedule::find($scheduleId);
        if (!$schedule) {
            return response()->json(['message' => 'Schedule not found'], 404);
        }

        $oldId = $schedule->assignment_type_id;
        $newId = $request->input('assignment_type_id');

        // Fetch names for the Audit Logger so humans can read it
        $oldName = $oldId ? DB::table('assignment_types')->where('id', $oldId)->value('name') : 'None';
        $newName = $newId ? DB::table('assignment_types')->where('id', $newId)->value('name') : 'None';

        // Update the new foreign key
        $schedule->assignment_type_id = $newId;
        $schedule->save();

        AuditLogger::logUpdate(
            model: 'Schedule',
            modelId: $schedule->schedule_id,
            oldData: ['assignment_type_id' => $oldId],
            newData: ['assignment_type_id' => $newId],
            description: "Updated Assignment Type: {$oldName} → {$newName}"
        );

        return response()->json(['message' => 'Assignment type updated', 'schedule' => $schedule]);
    }

    /**
     * Ensures that each course has a corresponding entry in section_courses.
     */
    private function ensureSectionCourseExists($row, $section)
    {
        // Skip if the course_assignment_id is null to avoid constraint violations
        if (is_null($row->course_assignment_id)) {
            return;
        }

        $cacheKey = $section->sections_per_program_year_id . '-'
                  . $row->course_assignment_id;

        if (!$this->sectionCoursesCache->has($cacheKey)) {
            // Insert missing section_course for new courses
            $id = DB::table('section_courses')->insertGetId([
                'sections_per_program_year_id' =>
                    $section->sections_per_program_year_id,
                'course_assignment_id' => $row->course_assignment_id,
                'is_copy' => 0, // Default to original
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $newSecCourse = (object) [
                'section_course_id' => $id,
                'sections_per_program_year_id' =>
                    $section->sections_per_program_year_id,
                'course_assignment_id' => $row->course_assignment_id,
                'is_copy' => 0,
            ];

            $this->sectionCoursesCache->put($cacheKey, collect([$newSecCourse]));
        }
    }

    /**
     * Assigns a course to a section and schedule.
     * Resolves the active elective from curriculum_electives
     * scoped to the given academic year.
     */
    private function assignCourseToSectionAndSchedule(
        $row,
        $section,
        &$sections,
        int $activeAcademicYearId = 0
    ) {
        if (is_null($row->course_assignment_id)) {
            return;
        }

        // Find or create the section in the response array
        $sectionIndex = $this->findOrCreateSection($sections, $section);

        $cacheKey = $section->sections_per_program_year_id . '-'
                  . $row->course_assignment_id;
        $sectionCourses = $this->sectionCoursesCache->get($cacheKey, []);

        foreach ($sectionCourses as $section_course) {
            $existingSchedule = $this->schedulesCache->get(
                $section_course->section_course_id,
                null
            );

            if ($existingSchedule) {
                $faculty = $existingSchedule->faculty_id ?
                    ($this->facultyCache->get($existingSchedule->faculty_id) ?? null)
                    : null;

                if ($faculty) {
                    $formattedName = $faculty->last_name . ', '
                                   . $faculty->first_name;
                    if ($faculty->middle_name) {
                        $formattedName .= ' ' . $faculty->middle_name;
                    }
                    if ($faculty->suffix_name) {
                        $formattedName .= ' ' . $faculty->suffix_name;
                    }
                    $faculty->professor = $formattedName;
                }

                $room = $existingSchedule->room_id ?
                    ($this->roomsCache->get($existingSchedule->room_id) ?? null)
                    : null;

                $scheduleId = $existingSchedule->schedule_id;
            } else {
                $faculty = null;
                $room = null;

                // Insert schedule into the schedules table with null values
                $scheduleId = DB::table('schedules')->insertGetId([
                    'section_course_id' => $section_course->section_course_id,
                    'day' => null,
                    'start_time' => null,
                    'end_time' => null,
                    'faculty_id' => null,
                    'room_id' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $newScheduleObj = (object) [
                    'schedule_id' => $scheduleId,
                    'section_course_id' => $section_course->section_course_id,
                    'day' => null,
                    'start_time' => null,
                    'end_time' => null,
                    'faculty_id' => null,
                    'room_id' => null,
                    'elective_id' => null,
                ];

                $this->schedulesCache->put(
                    $section_course->section_course_id,
                    $newScheduleObj
                );
            }

            $schedule = $this->schedulesCache->get(
                $section_course->section_course_id
            );

            $electiveTitle = null;
            $electiveCode = null;
            $electiveSlotName = null;

            // Use the schedule's own elective_id first;
            // fall back to the curriculum_electives assignment.
            $electiveId = $schedule->elective_id ?? null;

            if (!$electiveId) {
                // Resolve from curriculum_electives cache
                $matchedElective = null;
                foreach ($this->curriculumElectivesCache as $ce) {
                    if ($ce->curriculum_id == $row->curriculum_id &&
                        $ce->program_id == $row->program_id &&
                        $ce->year_level == $row->year_level &&
                        $ce->semester_id == $row->semester_id) {

                        if (strcasecmp(
                            $ce->elective_slot_name,
                            $row->course_title
                        ) === 0) {
                            if (is_null($matchedElective) ||
                                (!is_null($ce->academic_year_id) &&
                                 (int)$ce->academic_year_id ===
                                 (int)$activeAcademicYearId)) {
                                $matchedElective = $ce;
                            }
                        }
                    }
                }

                if ($matchedElective) {
                    $electiveId = $matchedElective->elective_id;
                }
            }

            if ($electiveId) {
                $elective = $this->electivesCache->get($electiveId, null);
                if ($elective) {
                    $electiveSlotName = $elective->elective_slot_name;
                    $electiveTitle = $elective->course_title;
                    $electiveCode  = $elective->course_code;
                }
            }

            if (!isset($sections[$sectionIndex]['courses'])) {
                $sections[$sectionIndex]['courses'] = [];
            }

            $sections[$sectionIndex]['courses'][] = [
                'course_assignment_id' => $row->course_assignment_id,
                'course_id' => $row->course_id,
                'course_code' => $electiveCode  ?? $row->course_code,
                'course_title' => $electiveTitle ?? $row->course_title,
                'lec_hours' => $row->lec_hours,
                'lab_hours' => $row->lab_hours,
                'units' => $row->units,
                'tuition_hours' => $row->tuition_hours,
                'schedule' => [
                    'schedule_id' => $scheduleId,
                    'day' => $schedule->day,
                    'start_time' => $schedule->start_time,
                    'end_time' => $schedule->end_time,
                    'elective_id' => $schedule->elective_id ?? null,
                    'elective_slot_name' => $electiveSlotName,
                ],
                'professor' => $faculty ? $faculty->professor : 'Not set',
                'faculty_id' => $faculty ? $faculty->id : null,
                'faculty_email' => $faculty ? $faculty->faculty_email : null,
                'room' => [
                    'room_id' => $room ? $room->room_id : null,
                    'room_code' => $room ? $room->room_code : 'Not set',
                ],
                'is_temporary' => false,
                'temporary_course_offering_id' => null,
                'temporary_type' => null,
                'temporary_status' => null,
                'petition_required' => false,
                'is_copy' => $section_course->is_copy,
                'section_course_id' => $section_course->section_course_id,
            ];
        }
    }

    private function appendTemporaryOfferings(array &$response, int $academicYearId, int $semesterId): void
    {
        $temporaryOfferings = DB::table('temporary_course_offerings as t')
            ->join('courses as co', 't.course_id', '=', 'co.course_id')
            ->join('programs as p', 't.program_id', '=', 'p.program_id')
            ->join('semesters as s', 't.semester_id', '=', 's.semester_id')
            ->leftJoin('program_year_level_curricula as pylc', function ($join) use ($academicYearId) {
                $join->on('pylc.program_id', '=', 't.program_id')
                    ->on('pylc.year_level', '=', 't.year_level')
                    ->where('pylc.academic_year_id', $academicYearId);
            })
            ->leftJoin('curricula as c', 'pylc.curriculum_id', '=', 'c.curriculum_id')
            ->leftJoin(
                'bridging_courses as bc',
                't.bridging_course_id',
                '=',
                'bc.bridging_course_id'
            )
            ->where('t.academic_year_id', $academicYearId)
            ->where('t.semester_id', $semesterId)
            ->where('t.is_archived', 0)
            ->where('t.status', 'Approved')
            ->select(
                't.temporary_course_offering_id',
                't.bridging_course_id',
                'bc.combined_with_program_id',
                't.program_id',
                't.year_level',
                't.section_per_program_year_id',
                't.applies_to_all_sections',
                't.type',
                't.status',
                't.min_petitioners',
                't.petitioners_count',
                't.petition_file_path',
                'co.course_id',
                'co.course_code',
                'co.course_title',
                'co.lec_hours',
                'co.lab_hours',
                'co.units',
                'co.tuition_hours',
                'p.program_code',
                'p.program_title',
                's.semester',
                's.semester_id',
                'c.curriculum_id',
                'c.curriculum_year'
            )
            ->get();

        foreach ($temporaryOfferings as $offering) {
            $row = (object) [
                'program_id' => $offering->program_id,
                'program_code' => $offering->program_code,
                'program_title' => $offering->program_title,
                'year_level' => $offering->year_level,
                'curriculum_id' => $offering->curriculum_id,
                'curriculum_year' => $offering->curriculum_year,
                'semester' => $offering->semester,
                'semester_id' => $offering->semester_id,
            ];

            $programIndex = $this->findOrCreateProgram($response, $row);
            $yearLevelIndex = $this->findOrCreateYearLevel($response[$programIndex]['year_levels'], $row);
            $semesterIndex = $this->findOrCreateSemester($response[$programIndex]['year_levels'][$yearLevelIndex]['semesters'], $row);

            $sections = $this->getTemporaryOfferingSections($offering, $academicYearId);

            foreach ($sections as $section) {
                $this->ensureTemporarySectionCourseExists($offering, $section);
                $this->assignTemporaryCourseToSectionAndSchedule(
                    $offering,
                    $section,
                    $response[$programIndex]['year_levels'][$yearLevelIndex]['semesters'][$semesterIndex]['sections']
                );
            }
        }
    }

    private function getTemporaryOfferingSections($offering, int $academicYearId)
    {
        if ($offering->applies_to_all_sections) {
            return DB::table('sections_per_program_year')
                ->where('academic_year_id', $academicYearId)
                ->where('program_id', $offering->program_id)
                ->where('year_level', $offering->year_level)
                ->get();
        }

        if (is_null($offering->section_per_program_year_id)) {
            return collect();
        }

        return DB::table('sections_per_program_year')
            ->where('sections_per_program_year_id', $offering->section_per_program_year_id)
            ->get();
    }

    private function ensureTemporarySectionCourseExists($offering, $section): void
    {
        $existingSectionCourse = DB::table('section_courses')
            ->where('sections_per_program_year_id', $section->sections_per_program_year_id)
            ->where('temporary_course_offering_id', $offering->temporary_course_offering_id)
            ->where('is_copy', 0)
            ->first();

        if ($existingSectionCourse) {
            return;
        }

        DB::table('section_courses')->insert([
            'sections_per_program_year_id' => $section->sections_per_program_year_id,
            'course_assignment_id' => null,
            'temporary_course_offering_id' => $offering->temporary_course_offering_id,
            'is_copy' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function assignTemporaryCourseToSectionAndSchedule($offering, $section, array &$sections): void
    {
        $sectionIndex = $this->findOrCreateSection($sections, $section);

        $sectionCourses = DB::table('section_courses')
            ->where('sections_per_program_year_id', $section->sections_per_program_year_id)
            ->where('temporary_course_offering_id', $offering->temporary_course_offering_id)
            ->get();

        foreach ($sectionCourses as $section_course) {
            $existingSchedule = DB::table('schedules')
                ->where('section_course_id', $section_course->section_course_id)
                ->first();

            if ($existingSchedule) {
                $faculty = $existingSchedule->faculty_id ? DB::table('faculty')
                    ->join('users', 'faculty.user_id', '=', 'users.id')
                    ->where('faculty.id', $existingSchedule->faculty_id)
                    ->select(
                        'faculty.id',
                        'users.id as user_id',
                        'users.email as faculty_email'
                    )
                    ->first() : null;

                if ($faculty) {
                    $user = \App\Models\User::find($faculty->user_id);
                    $faculty->professor = $user->formatted_name;
                }

                $room = $existingSchedule->room_id ? DB::table('rooms')
                    ->where('room_id', $existingSchedule->room_id)
                    ->first() : null;

                $scheduleId = $existingSchedule->schedule_id;
            } else {
                $faculty = null;
                $room = null;

                $scheduleId = DB::table('schedules')->insertGetId([
                    'section_course_id' => $section_course->section_course_id,
                    'day' => null,
                    'start_time' => null,
                    'end_time' => null,
                    'faculty_id' => null,
                    'room_id' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            $schedule = DB::table('schedules')
                ->where('section_course_id', $section_course->section_course_id)
                ->first();

            if (!isset($sections[$sectionIndex]['courses'])) {
                $sections[$sectionIndex]['courses'] = [];
            }

            $sections[$sectionIndex]['courses'][] = [
                'course_assignment_id' => null,
                'temporary_course_offering_id' => $offering->temporary_course_offering_id,
                'course_id' => $offering->course_id,
                'course_code' => $offering->course_code,
                'course_title' => $offering->course_title,
                'lec_hours' => $offering->lec_hours,
                'lab_hours' => $offering->lab_hours,
                'units' => $offering->units,
                'tuition_hours' => $offering->tuition_hours,
                'schedule' => [
                    'schedule_id' => $scheduleId,
                    'day' => $schedule->day,
                    'start_time' => $schedule->start_time,
                    'end_time' => $schedule->end_time,
                    'elective_id' => $schedule->elective_id ?? null,
                ],
                'professor' => $faculty ? $faculty->professor : 'Not set',
                'faculty_id' => $faculty ? $faculty->id : null,
                'faculty_email' => $faculty ? $faculty->faculty_email : null,
                'room' => [
                    'room_id' => $room ? $room->room_id : null,
                    'room_code' => $room ? $room->room_code : 'Not set',
                ],
                'is_temporary' => true,
                'temporary_type' => $offering->type,
                'temporary_status' => $offering->status,
                'petition_required' => in_array($offering->type, ['petition', 'tutorial'], true),
                'bridging_course_id' => $offering->bridging_course_id ?? null,
                'combined_with_program_id' =>
                    $offering->combined_with_program_id ?? null,
                'is_copy' => $section_course->is_copy,
                'section_course_id' => $section_course->section_course_id,
            ];
        }
    }

    /**
     * Finds or creates a program in the response data.
     */
    private function findOrCreateProgram(&$response, $row)
    {
        $programIndex = array_search($row->program_id, array_column($response, 'program_id'));

        if ($programIndex === false) {
            $response[] = [
                'program_id' => $row->program_id,
                'program_code' => $row->program_code,
                'program_title' => $row->program_title,
                'year_levels' => [],
            ];
            return count($response) - 1;
        }

        return $programIndex;
    }

    /**
     * Finds or creates a year level in the response data.
     */
    private function findOrCreateYearLevel(&$yearLevels, $row)
    {
        foreach ($yearLevels as $index => $yearLevel) {
            if ($yearLevel['year_level'] == $row->year_level && $yearLevel['curriculum_id'] == $row->curriculum_id) {
                return $index;
            }
        }

        $yearLevels[] = [
            'year_level' => $row->year_level,
            'curriculum_id' => $row->curriculum_id,
            'curriculum_year' => $row->curriculum_year,
            'semesters' => [],
        ];
        return count($yearLevels) - 1;
    }

    /**
     * Finds or creates a semester in the response data.
     */
    private function findOrCreateSemester(&$semesters, $row)
    {
        foreach ($semesters as $index => $semester) {
            if ($semester['semester'] == $row->semester) {
                return $index;
            }
        }

        $semesters[] = [
            'semester' => $row->semester,
            'sections' => [],
        ];
        return count($semesters) - 1;
    }

    /**
     * Finds or creates a section in the response data.
     */
    private function findOrCreateSection(&$sections, $section)
    {
        foreach ($sections as $index => $sec) {
            if ($sec['section_per_program_year_id'] == $section->sections_per_program_year_id) {
                return $index;
            }
        }

        $sections[] = [
            'section_per_program_year_id' => $section->sections_per_program_year_id,
            'section_name' => $section->section_name,
            'courses' => [],
        ];

        return count($sections) - 1;
    }

    /**
     * Toggle all schedules publication status
     */
    public function toggleAllSchedules(Request $request)
    {
        // Step 1: Validate the input
        $validated = $request->validate([
            'is_published' => 'required|boolean',
        ]);

        try {
            return DB::transaction(function () use ($validated) {
                // Step 2: Get the active semester and academic year
                $activeSemester = DB::table('active_semesters')
                    ->where('is_active', 1)
                    ->first();

                if (!$activeSemester) {
                    return response()->json(['message' => 'No active semester found'], 404);
                }

                // Get all faculty with schedules in active semester
                $facultiesWithSchedules = DB::table('schedules')
                    ->join('section_courses', function ($join) {
                        $join->on('schedules.section_course_id', '=', 'section_courses.section_course_id')
                            ->where('section_courses.is_copy', 0);
                    })
                    ->join('course_assignments', 'section_courses.course_assignment_id', '=', 'course_assignments.course_assignment_id')
                    ->join('sections_per_program_year', function ($join) use ($activeSemester) {
                        $join->on('section_courses.sections_per_program_year_id', '=', 'sections_per_program_year.sections_per_program_year_id')
                            ->where('sections_per_program_year.academic_year_id', $activeSemester->academic_year_id);
                    })
                    ->whereNotNull('schedules.faculty_id')
                    ->distinct()
                    ->pluck('schedules.faculty_id');

                if ($facultiesWithSchedules->isEmpty()) {
                    return response()->json(['message' => 'No faculty schedules found for the active semester'], 404);
                }

                // Update or create publication records
                foreach ($facultiesWithSchedules as $facultyId) {
                    DB::table('faculty_schedule_publication')->updateOrInsert(
                        [
                            'faculty_id' => $facultyId,
                            'academic_year_id' => $activeSemester->academic_year_id,
                            'semester_id' => $activeSemester->semester_id,
                        ],
                        [
                            'is_published' => $validated['is_published'],
                            'updated_at' => now(),
                        ]
                    );
                }

                // Update preferences settings
                DB::table('preferences_settings')
                    ->update([
                        'is_enabled' => 0,
                        'global_start_date' => null,
                        'global_deadline' => null,
                        'individual_start_date' => null,
                        'individual_deadline' => null,
                        'updated_at' => now(),
                    ]);

                // ═══════════════════════════════════════════════════════
                // AUDIT LOG: All Schedules Published/Unpublished
                // ═══════════════════════════════════════════════════════
                AuditLogger::log(
                    action: 'update',
                    description: sprintf(
                        "%s all faculty schedules (%d faculty) for %s",
                        $validated['is_published'] ? 'Published' : 'Unpublished',
                        $facultiesWithSchedules->count(),
                        "Academic Year {$activeSemester->academic_year_id}, Semester {$activeSemester->semester_id}"
                    ),
                    model: 'FacultySchedulePublication',
                    metadata: [
                        'faculty_count' => $facultiesWithSchedules->count(),
                        'is_published' => $validated['is_published'],
                        'academic_year_id' => $activeSemester->academic_year_id,
                        'semester_id' => $activeSemester->semester_id
                    ]
                );

                return response()->json([
                    'message' => 'Faculty schedule publications updated successfully',
                    'updated_count' => $facultiesWithSchedules->count(),
                    'is_published' => $validated['is_published'],
                    'active_semester_id' => $activeSemester->active_semester_id,
                    'academic_year_id' => $activeSemester->academic_year_id,
                    'semester_id' => $activeSemester->semester_id,
                ]);
            });
        } catch (\Exception $e) {
            Log::error('Failed to toggle all schedules: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to update schedules. Please try again.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    /**
     * Toggle a single faculty schedules publication status
     */
    public function toggleSingleSchedule(Request $request)
    {
        // Step 1: Validate the input
        $validated = $request->validate([
            'faculty_id' => 'required|integer|exists:faculty,id',
            'is_published' => 'required|boolean',
        ]);

        try {
            return DB::transaction(function () use ($validated) {
                $activeSemester = DB::table('active_semesters')
                    ->where('is_active', 1)
                    ->first();

                if (!$activeSemester) {
                    return response()->json(['message' => 'No active semester found'], 404);
                }

                // Check if faculty has schedules in active semester
                $hasSchedules = DB::table('schedules')
                    ->join('section_courses', function ($join) {
                        $join->on('schedules.section_course_id', '=', 'section_courses.section_course_id');
                    })
                    ->join('sections_per_program_year', function ($join) use ($activeSemester) {
                        $join->on('section_courses.sections_per_program_year_id', '=', 'sections_per_program_year.sections_per_program_year_id')
                            ->where('sections_per_program_year.academic_year_id', $activeSemester->academic_year_id);
                    })
                    ->where('schedules.faculty_id', $validated['faculty_id'])
                    ->exists();

                if (!$hasSchedules) {
                    return response()->json([
                        'message' => 'No schedules found for the given faculty in the active semester',
                    ], 404);
                }

                // Update or create publication record
                DB::table('faculty_schedule_publication')->updateOrInsert(
                    [
                        'faculty_id' => $validated['faculty_id'],
                        'academic_year_id' => $activeSemester->academic_year_id,
                        'semester_id' => $activeSemester->semester_id,
                    ],
                    [
                        'is_published' => $validated['is_published'],
                        'updated_at' => now(),
                    ]
                );

                // Update preferences settings
                DB::table('preferences_settings')
                    ->where('faculty_id', $validated['faculty_id'])
                    ->update([
                        'is_enabled' => 0,
                        'global_start_date' => null,
                        'global_deadline' => null,
                        'individual_start_date' => null,
                        'individual_deadline' => null,
                        'updated_at' => now(),
                    ]);

                // ═══════════════════════════════════════════════════════
                // AUDIT LOG: Single Faculty Schedule Published/Unpublished
                // ═══════════════════════════════════════════════════════
                $facultyUser = DB::table('faculty')
                    ->join('users', 'faculty.user_id', '=', 'users.id')
                    ->where('faculty.id', $validated['faculty_id'])
                    ->select('users.first_name', 'users.last_name', 'users.email')
                    ->first();

                $facultyName = $facultyUser ? "{$facultyUser->first_name} {$facultyUser->last_name}" : "Faculty ID {$validated['faculty_id']}";

                AuditLogger::log(
                    action: 'update',
                    description: sprintf(
                        "%s schedule for %s",
                        $validated['is_published'] ? 'Published' : 'Unpublished',
                        $facultyName
                    ),
                    model: 'FacultySchedulePublication',
                    modelId: $validated['faculty_id'],
                    metadata: [
                        'faculty_id' => $validated['faculty_id'],
                        'is_published' => $validated['is_published']
                    ]
                );

                return response()->json([
                    'message' => 'Publication status updated successfully for the faculty',
                    'faculty_id' => $validated['faculty_id'],
                    'is_published' => $validated['is_published'],
                ]);
            });
        } catch (\Exception $e) {
            Log::error('Failed to toggle single faculty schedule: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to update faculty schedule. Please try again.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    /**
     * Get scheduling suggestions using a Multi-Tier Heuristic Fallback Strategy.
     * @param Request $request [program_id, year_level, section_id, course_id]
     * @return \Illuminate\Http\JsonResponse
     */
    public function getHeuristicSchedulingSuggestion(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'program_id' => 'required|integer|exists:programs,program_id',
            'year_level' => 'required|integer',
            'section_id' => 'required|integer',
            'course_id' => 'required|integer|exists:courses,course_id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation Error',
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $programId = $request->input('program_id');
        $yearLevel = $request->input('year_level');
        $sectionId = $request->input('section_id');
        $courseId = $request->input('course_id');

        $activeSemester = DB::table('active_semesters')
            ->where('is_active', 1)
            ->first();

        if (!$activeSemester) {
            return response()->json([
                'message' => 'No active semester found',
                'success' => false,
            ], 404);
        }

        // Tier 1: Historical "Course Experts" (Who taught this before?)
        $suggestion = $this->tryHistoricalExperts($courseId, $activeSemester);
        if ($suggestion) return $suggestion;

        // Tier 2: Current Semester Preferences
        $suggestion = $this->tryCurrentPreferences($courseId, $programId, $yearLevel, $sectionId, $activeSemester);
        if ($suggestion) return $suggestion;

        // Tier 3: Load Balancing (Available faculty with lowest load)
        $suggestion = $this->tryLoadBalancing($activeSemester);
        if ($suggestion) return $suggestion;

        return response()->json([
            'message' => 'No valid candidates found after full heuristic search',
            'success' => false,
        ], 200);
    }

    /**
     * Tier 1: Attempts to find candidates from current semester faculty preferences.
     */
    private function tryCurrentPreferences($courseId, $programId, $yearLevel, $sectionId, $activeSemester)
    {
        $prefs = DB::table('preferences as p')
            ->join('preference_days as pd', 'p.preferences_id', '=', 'pd.preference_id')
            ->leftJoin('course_assignments as ca', 'p.course_assignment_id', '=', 'ca.course_assignment_id')
            ->leftJoin('temporary_course_offerings as tco', 'p.temporary_course_offering_id', '=', 'tco.temporary_course_offering_id')
            ->join('faculty as f', 'p.faculty_id', '=', 'f.id')
            ->join('users as u', 'f.user_id', '=', 'u.id')
            ->where('p.active_semester_id', $activeSemester->active_semester_id)
            ->where('p.is_ignored', 0)
            ->where(function ($q) use ($courseId) {
                $q->where('ca.course_id', $courseId)
                  ->orWhere('tco.course_id', $courseId);
            })
            ->select(
                'p.faculty_id',
                'u.first_name', 'u.last_name',
                'pd.preferred_day', 'pd.preferred_start_time', 'pd.preferred_end_time'
            )
            ->get();

        foreach ($prefs as $pref) {
            if ($this->isFacultyAvailable($pref->faculty_id, $pref->preferred_day, $pref->preferred_start_time, $pref->preferred_end_time, $activeSemester->active_semester_id)) {
                return $this->formatSuggestionResponse($pref, 'Current Preference');
            }
        }

        return null;
    }

    /**
     * Tier 2: Attempts to find candidates who taught this course in previous semesters.
     */
    private function tryHistoricalExperts($courseId, $activeSemester)
    {
        // Find faculty who have taught this course in previous semesters
        $experts = DB::table('schedules as s')
            ->join('section_courses as sc', 's.section_course_id', '=', 'sc.section_course_id')
            ->join('course_assignments as ca', 'sc.course_assignment_id', '=', 'ca.course_assignment_id')
            ->join('faculty as f', 's.faculty_id', '=', 'f.id')
            ->join('users as u', 'f.user_id', '=', 'u.id')
            ->where('ca.course_id', $courseId)
            ->where('ca.semester_id', '!=', $activeSemester->semester_id)
            ->select(
                's.faculty_id', 'u.first_name', 'u.last_name',
                's.day', 's.start_time', 's.end_time',
                DB::raw('COUNT(*) as frequency')
            )
            ->groupBy('s.faculty_id', 'u.first_name', 'u.last_name', 's.day', 's.start_time', 's.end_time')
            ->orderBy('frequency', 'desc')
            ->limit(5)
            ->get();

        foreach ($experts as $expert) {
            if ($this->isFacultyAvailable($expert->faculty_id, $expert->day, $expert->start_time, $expert->end_time, $activeSemester->active_semester_id)) {
                return $this->formatSuggestionResponse($expert, 'Historical Expert', true);
            }
        }

        return null;
    }

    /**
     * Tier 3: Attempts to find available faculty with the lowest current workload.
     */
    private function tryLoadBalancing($activeSemester)
    {
        // Default working hours for generic assignment (7:30 AM - 10:30 AM)
        $defaultDay = 'Monday';
        $defaultStart = '07:30:00';
        $defaultEnd = '10:30:00';

        // Find faculty with lowest current load
        $candidates = DB::table('faculty as f')
            ->join('users as u', 'f.user_id', '=', 'u.id')
            ->select('f.id as faculty_id', 'u.first_name', 'u.last_name')
            ->selectRaw('
                (SELECT COUNT(*) 
                 FROM schedules s 
                 JOIN section_courses sc ON s.section_course_id = sc.section_course_id
                 JOIN course_assignments ca ON sc.course_assignment_id = ca.course_assignment_id
                 WHERE s.faculty_id = f.id 
                 AND ca.semester_id = ?
                ) as load_count', [$activeSemester->semester_id])
            ->orderBy('load_count', 'asc')
            ->limit(10)
            ->get();

        foreach ($candidates as $candidate) {
            // Try different days if Monday is full
            $days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            foreach ($days as $day) {
                if ($this->isFacultyAvailable($candidate->faculty_id, $day, $defaultStart, $defaultEnd, $activeSemester->active_semester_id)) {
                    $candidate->preferred_day = $day;
                    $candidate->preferred_start_time = $defaultStart;
                    $candidate->preferred_end_time = $defaultEnd;
                    return $this->formatSuggestionResponse($candidate, 'Load Balancing');
                }
            }
        }

        return null;
    }

    /**
     * Checks if a faculty member is available at a specific time in the current semester.
     * @return bool True if available, false if there is a conflict.
     */
    private function isFacultyAvailable($facultyId, $day, $start, $end, $activeSemesterId)
    {
        if (!$day || !$start || !$end) return false;

        return !DB::table('schedules as s')
            ->join('section_courses as sc', 's.section_course_id', '=', 'sc.section_course_id')
            ->join('course_assignments as ca', 'sc.course_assignment_id', '=', 'ca.course_assignment_id')
            ->where('s.faculty_id', $facultyId)
            ->where('s.day', $day)
            ->where('ca.semester_id', function($query) use ($activeSemesterId) {
                $query->select('semester_id')
                    ->from('active_semesters')
                    ->where('active_semester_id', $activeSemesterId);
            })
            ->where(function ($q) use ($start, $end) {
                $q->where('s.start_time', '<', $end)
                  ->where('s.end_time', '>', $start);
            })
            ->exists();
    }

    /**
     * Standardizes the JSON response for a scheduling suggestion.
     */
    private function formatSuggestionResponse($data, $source, $isHistorical = false)
    {
        $name = trim(($data->last_name ?? '') . ', ' . ($data->first_name ?? ''));
        
        return response()->json([
            'success' => true,
            'source' => $source,
            'faculty_name' => $name,
            'faculty_id' => $data->faculty_id,
            'preference_day' => $isHistorical ? $data->day : $data->preferred_day,
            'preferred_start_time' => $this->formatTo12h($isHistorical ? $data->start_time : $data->preferred_start_time),
            'preferred_end_time' => $this->formatTo12h($isHistorical ? $data->end_time : $data->preferred_end_time),
        ]);
    }

    /**
     * Formats a 24-hour time string to 12-hour format (e.g., "13:00" -> "1:00 PM").
     */
    private function formatTo12h($time)
    {
        if (!$time) return null;
        return date("g:i A", strtotime($time));
    }
    
}