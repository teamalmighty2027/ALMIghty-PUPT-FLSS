<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessExternalScheduleChange;
use App\Models\Schedule;
use App\Models\SectionCourse;
use App\Models\Room;
use \App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class ScheduleController extends Controller
{
    /**
     * Fetches schedules for a historical (non-active) academic year and semester.
     */
    public function getHistoricalSchedules(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'academic_year_id' => 'required|integer|exists:academic_years,academic_year_id',
            'semester_id' => 'required|integer',
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
            ->where('s.semester', $semesterId)
            ->where('pylc.academic_year_id', $academicYearId)
            ->orderBy('p.program_id')
            ->orderBy('yl.year')
            ->orderBy('s.semester')
            ->orderBy('co.course_code')
            ->get();

        $response = [];

        foreach ($assignedCourses as $row) {
            $programIndex = $this->findOrCreateProgram($response, $row);
            $yearLevelIndex = $this->findOrCreateYearLevel($response[$programIndex]['year_levels'], $row);
            $semesterIndex = $this->findOrCreateSemester($response[$programIndex]['year_levels'][$yearLevelIndex]['semesters'], $row);

            $sections = DB::table('sections_per_program_year')
                ->where('program_id', $row->program_id)
                ->where('year_level', $row->year_level)
                ->where('academic_year_id', $academicYearId)
                ->get();

            foreach ($sections as $section) {
                $this->assignHistoricalCourseToSectionAndSchedule($row, $section, $response[$programIndex]['year_levels'][$yearLevelIndex]['semesters'][$semesterIndex]['sections']);
            }
        }

        return response()->json([
            'academic_year_id' => $academicYearId,
            'semester_id' => $semesterId,
            'programs' => $response,
        ]);
    }

    /**
     * Assigns a historical course to a section and schedule (read-only).
     */
    private function assignHistoricalCourseToSectionAndSchedule($row, $section, &$sections)
    {
        if (is_null($row->course_assignment_id)) {
            return;
        }

        $sectionIndex = $this->findOrCreateSection($sections, $section);

        $sectionCourses = SectionCourse::where('sections_per_program_year_id', $section->sections_per_program_year_id)
            ->where('course_assignment_id', $row->course_assignment_id)
            ->get();

        foreach ($sectionCourses as $section_course) {
            $existingSchedule = Schedule::where('section_course_id', $section_course->section_course_id)
                ->first();

            if (!$existingSchedule) {
                continue;
            }

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
                $user = User::find($faculty->user_id);
                $faculty->professor = $user->formatted_name;
            }

            $room = $existingSchedule->room_id ? Room::find($existingSchedule->room_id) : null;

            if (!isset($sections[$sectionIndex]['courses'])) {
                $sections[$sectionIndex]['courses'] = [];
            }

            $sections[$sectionIndex]['courses'][] = [
                'course_assignment_id' => $row->course_assignment_id,
                'course_id' => $row->course_id,
                'course_code' => $row->course_code,
                'course_title' => $row->course_title,
                'lec_hours' => $row->lec_hours,
                'lab_hours' => $row->lab_hours,
                'units' => $row->units,
                'tuition_hours' => $row->tuition_hours,
                'schedule' => [
                    'schedule_id' => $existingSchedule->schedule_id,
                    'day' => $existingSchedule->day,
                    'start_time' => $existingSchedule->start_time,
                    'end_time' => $existingSchedule->end_time,
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
            $yearLevelIndex = $this->findOrCreateYearLevel($response[$programIndex]['year_levels'], $row);
            $semesterIndex = $this->findOrCreateSemester($response[$programIndex]['year_levels'][$yearLevelIndex]['semesters'], $row);

            // Fetch sections for the current program-year level
            $sections = DB::table('sections_per_program_year')
                ->where('program_id', $row->program_id)
                ->where('year_level', $row->year_level)
                ->where('academic_year_id', $activeAcademicYearId)
                ->get();

            foreach ($sections as $section) {
                // Ensure section_courses entry exists for each assigned course
                $this->ensureSectionCourseExists($row, $section);

                // Now assign the course to each section with a specific schedule
                $this->assignCourseToSectionAndSchedule($row, $section, $response[$programIndex]['year_levels'][$yearLevelIndex]['semesters'][$semesterIndex]['sections']);
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

        // Create a new schedule with null fields for the copied course
        $newScheduleId = DB::table('schedules')->insertGetId([
            'section_course_id' => $newSectionCourseId,
            'day' => null,
            'start_time' => null,
            'end_time' => null,
            'faculty_id' => null,
            'room_id' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

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
                ->where('t.temporary_course_offering_id', $originalSectionCourse->temporary_course_offering_id)
                ->select('co.course_id', 'co.course_code', 'co.course_title', 'co.lec_hours', 'co.lab_hours', 'co.units', 'co.tuition_hours', 't.type', 't.status')
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
            'schedule' => [
                'schedule_id' => $newScheduleId,
                'day' => 'Not set',
                'start_time' => null,
                'end_time' => null,
            ],
            'professor' => 'Not set',
            'faculty_id' => null,
            'faculty_email' => null,
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
            ];

            // 2. APPLY UPDATES
            $schedule->faculty_id = $request->input('faculty_id');
            $schedule->room_id = $request->input('room_id');
            $schedule->day = $request->input('day');
            $schedule->start_time = $request->input('start_time');
            $schedule->end_time = $request->input('end_time');
            
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
     * Ensures that each course has a corresponding entry in section_courses.
     */
    private function ensureSectionCourseExists($row, $section)
    {
        // Skip if the course_assignment_id is null to avoid constraint violations
        if (is_null($row->course_assignment_id)) {
            return;
        }

        $existingSectionCourse = DB::table('section_courses')
            ->where('sections_per_program_year_id', $section->sections_per_program_year_id)
            ->where('course_assignment_id', $row->course_assignment_id)
            ->first();

        if (!$existingSectionCourse) {
            // Insert missing section_course for new courses
            DB::table('section_courses')->insert([
                'sections_per_program_year_id' => $section->sections_per_program_year_id,
                'course_assignment_id' => $row->course_assignment_id,
                'is_copy' => 0, // Default to original
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    /**
     * Assigns a course to a section and schedule.
     */
    private function assignCourseToSectionAndSchedule($row, $section, &$sections)
    {
        if (is_null($row->course_assignment_id)) {
            return;
        }

        // Find or create the section in the response array
        $sectionIndex = $this->findOrCreateSection($sections, $section);

        // Fetch all section_courses, including duplicates
        $sectionCourses = DB::table('section_courses')
            ->where('sections_per_program_year_id', $section->sections_per_program_year_id)
            ->where('course_assignment_id', $row->course_assignment_id)
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

                // If faculty exists, fetch the user and use the formatted_name
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
            }

            $schedule = DB::table('schedules')
                ->where('section_course_id', $section_course->section_course_id)
                ->first();

            if (!isset($sections[$sectionIndex]['courses'])) {
                $sections[$sectionIndex]['courses'] = [];
            }

            $sections[$sectionIndex]['courses'][] = [
                'course_assignment_id' => $row->course_assignment_id,
                'course_id' => $row->course_id,
                'course_code' => $row->course_code,
                'course_title' => $row->course_title,
                'lec_hours' => $row->lec_hours,
                'lab_hours' => $row->lab_hours,
                'units' => $row->units,
                'tuition_hours' => $row->tuition_hours,
                'schedule' => [
                    'schedule_id' => $scheduleId,
                    'day' => $schedule->day,
                    'start_time' => $schedule->start_time,
                    'end_time' => $schedule->end_time,
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
            ->where('t.academic_year_id', $academicYearId)
            ->where('t.semester_id', $semesterId)
            ->where('t.is_archived', 0)
            ->where('t.status', 'Approved')
            ->select(
                't.temporary_course_offering_id',
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

                // Dispatch external service job
                ProcessExternalScheduleChange::dispatch('toggleAllSchedules', $validated['is_published']);

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

                ProcessExternalScheduleChange::dispatch('toggleSingleSchedule', $validated['is_published'], $validated['faculty_id']);

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
     * Get AI Scheduling Suggestions
     */
    public function getAISchedulingSuggestion(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'program_id' => 'required|integer|exists:programs,program_id',
            'year_level' => 'required|integer',
            'section_id' => 'required|integer',
            'course_id' => 'nullable|integer|exists:courses,course_id',
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
                'errors' => ['active_semester' => ['No active semester found']],
            ], 404);
        }

        $query = DB::table('preferences as p')
            ->join('preference_days as pd', 'p.preferences_id', '=', 'pd.preference_id')
            ->leftJoin('course_assignments as ca', 'p.course_assignment_id', '=', 'ca.course_assignment_id')
            ->leftJoin('curricula_program as cp', 'ca.curricula_program_id', '=', 'cp.curricula_program_id')
            ->leftJoin('section_courses as sc', 'ca.course_assignment_id', '=', 'sc.course_assignment_id')
            ->leftJoin('sections_per_program_year as sp', 'sc.sections_per_program_year_id', '=', 'sp.sections_per_program_year_id')
            ->leftJoin('semesters as s', 'ca.semester_id', '=', 's.semester_id')
            ->leftJoin('year_levels as yl', 's.year_level_id', '=', 'yl.year_level_id')
            ->leftJoin('temporary_course_offerings as tco', 'p.temporary_course_offering_id', '=', 'tco.temporary_course_offering_id')
            ->leftJoin('sections_per_program_year as psp', 'p.sections_per_program_year_id', '=', 'psp.sections_per_program_year_id')
            ->join('faculty as f', 'p.faculty_id', '=', 'f.id')
            ->join('users as u', 'f.user_id', '=', 'u.id')
            ->leftJoin('faculty_type as ft', 'f.faculty_type_id', '=', 'ft.faculty_type_id')
            ->where('p.active_semester_id', $activeSemester->active_semester_id)
            ->where(function ($q) use ($programId, $yearLevel, $sectionId, $activeSemester) {
                $q->where(function ($q) use ($programId, $yearLevel, $sectionId) {
                    $q->whereNotNull('p.course_assignment_id')
                        ->where('cp.program_id', $programId)
                        ->where('yl.year', $yearLevel)
                        ->where(function ($q) use ($sectionId) {
                            $q->where('sp.sections_per_program_year_id', $sectionId)
                                ->orWhereNull('sp.sections_per_program_year_id');
                        });
                })->orWhere(function ($q) use ($programId, $yearLevel, $sectionId, $activeSemester) {
                    $q->whereNotNull('p.temporary_course_offering_id')
                        ->where('tco.program_id', $programId)
                        ->where('tco.year_level', $yearLevel)
                        ->where('p.sections_per_program_year_id', $sectionId)
                        ->where(function ($q) use ($sectionId) {
                            $q->where('tco.applies_to_all_sections', 1)
                                ->orWhere('tco.section_per_program_year_id', $sectionId);
                        })
                        ->where('tco.academic_year_id', $activeSemester->academic_year_id)
                        ->where('tco.semester_id', $activeSemester->semester_id)
                        ->where('tco.is_archived', 0)
                        ->where('tco.status', 'Approved');
                });
            });

        if (!is_null($courseId)) {
            $query->where(function ($q) use ($courseId) {
                $q->where('ca.course_id', $courseId)
                    ->orWhere('tco.course_id', $courseId);
            });
        }

        $query->select(
            'p.preferences_id',
            'p.faculty_id',
            'p.course_assignment_id',
            'p.temporary_course_offering_id',
            DB::raw('COALESCE(ca.course_id, tco.course_id) as course_id'),
            'p.created_at as submitted_at',
            'pd.preferred_day',
            'pd.preferred_start_time',
            'pd.preferred_end_time',
            'f.id as faculty_id',
            'u.first_name',
            'u.last_name',
            'u.middle_name',
            'ft.faculty_type'
        )
        ->selectRaw('(SELECT COUNT(*) FROM schedules s WHERE s.faculty_id = p.faculty_id AND s.day IS NOT NULL) AS assigned_count')
        ->selectRaw('EXISTS (
                SELECT 1
                FROM preferences px
                JOIN course_assignments cax ON px.course_assignment_id = cax.course_assignment_id
                JOIN curricula_program cpx ON cax.curricula_program_id = cpx.curricula_program_id
                WHERE px.faculty_id = p.faculty_id
                  AND px.course_assignment_id = p.course_assignment_id
                  AND cpx.program_id != cp.program_id
            ) AS has_other_program_preference')
        ->selectRaw("
                (
                    (SELECT COUNT(*) FROM schedules s2 WHERE s2.faculty_id = p.faculty_id AND s2.day IS NOT NULL) * 1000
                    + (CASE WHEN EXISTS (
                        SELECT 1
                        FROM preferences px2
                        JOIN course_assignments cax2 ON px2.course_assignment_id = cax2.course_assignment_id
                        JOIN curricula_program cpx2 ON cax2.curricula_program_id = cpx2.curricula_program_id
                        WHERE px2.faculty_id = p.faculty_id
                          AND px2.course_assignment_id = p.course_assignment_id
                          AND cpx2.program_id != cp.program_id
                    ) THEN 1000000 ELSE 0 END)
                    + (CASE LOWER(ft.faculty_type)
                        WHEN 'full-time' THEN 0
                        WHEN 'designee'  THEN 10
                        WHEN 'part-time' THEN 20
                        WHEN 'temporary' THEN 30
                        ELSE 25 END)
                    + COALESCE(FLOOR(UNIX_TIMESTAMP(p.created_at) / 100000), 9223372036854775807)
                ) AS score
            ")
        ->orderBy('score', 'asc')
        ->orderBy('p.created_at', 'asc')
        ->limit(1);

        $top = $query->first();

        if (!$top) {
            return response()->json([
                'message' => 'No preferences found for given parameters',
                'success' => false,
                'program_id' => $programId,
                'year_level' => $yearLevel,
                'section_id' => $sectionId,
                'course_id' => $courseId,
                'active_semester_id' => $activeSemester->active_semester_id,     
                'prefs_count' => 0,
            ], 200);
        }

        $name = trim(($top->last_name ?? '') . ', ' . 
            ($top->first_name ?? '') . ' ' . ($top->middle_name ?? ''));

        return response()->json([
            'message' => 'AI scheduling suggestions generated',
            'success' => true,
            'program_id' => $programId,
            'year_level' => $yearLevel,
            'section_id' => $sectionId,
            'course_id' => $courseId,
            'faculty_name' => $name,
            'faculty_id' => $top->faculty_id,
            'faculty_type' => $top->faculty_type,
            'preference_day' => $top->preferred_day,
            'preferred_start_time' => $top->preferred_start_time,
            'preferred_end_time' => $top->preferred_end_time,
        ]);
    }
}