<?php

namespace App\Http\Controllers\External\v1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Faculty;
use App\Models\UserProfile;
use App\Models\Program;
use App\Models\Room;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use App\Services\AuditLogger;
use Throwable;

class ExternalController extends Controller
{
    /**
     * API Health Check Endpoint
     * Checks database connectivity and returns a simple health status.
     */
    public function healthCheck()
    {
        try {
            DB::connection()->getPdo();

            return response()->json([
                'status' => 'healthy',
                'timestamp' => now()->toIso8601String(),
                'database' => 'connected',
            ], 200);
        } catch (Throwable $e) {
            Log::error('API Health Check Failed: ' . $e->getMessage());

            return response()->json([
                'status' => 'unhealthy',
                'timestamp' => now()->toIso8601String(),
                'database' => 'disconnected',
            ], 503);
        }
    }

    /**
     * For: Faculty Attendance System
     * Retrieves faculty schedules for FAS integration.
     * Returns faculty details with their assigned schedules for the current active semester.
     */
    public function partTimeFacultySchedules(Request $request)
    {
        $this->logExternalAccess($request, 'Part-time faculty schedules');

        // Step 1: Retrieve the current active semester with academic year details
        $activeSemester = $this->getActiveSemester();

        if (! $activeSemester) {
            return response()->json(['message' => 'No active semester found.'], 404);
        }

        // Check if there are any published schedules for the active semester
        if (! $this->checkPublishedSchedules($activeSemester)) {
            return $this->buildUnpublishedResponse($activeSemester);
        }

        // Step 2: Prepare queries and fetch data
        $schedulesSub = $this->buildFacultyScheduleSubquery($activeSemester);
        $rows = $this->fetchFacultyWithSchedules($activeSemester, $schedulesSub);
        $faculties = $this->groupFacultySchedules($rows, 'part-time');

        // Step 3: Structure the response
        return response()->json([
            'status'                     => 'published',
            'academic_year'              => $activeSemester->year_start . '-' . 
                                            $activeSemester->year_end,
            'semester'                   => $this->formatSemesterLabel(
                                                $activeSemester->semester
                                            ),
            'start_date'                  => $activeSemester->start_date,
            'end_date'                    => $activeSemester->end_date,
            'parttime_faculty_schedules' => $faculties,
        ]);
    }

    /**
     * For: Faculty Attendance System
     * Retrieves temporary faculty schedules for FAS integration.
     * Returns faculty details with their assigned schedules for the current active semester.
     */
    public function temporaryFacultySchedules(Request $request)
    {
        $this->logExternalAccess($request, 'Temporary faculty schedules');

        // Step 1: Retrieve the current active semester with academic year details
        $activeSemester = $this->getActiveSemester();

        if (! $activeSemester) {
            return response()->json(['message' => 'No active semester found.'], 404);
        }

        // Check if there are any published schedules for the active semester
        if (! $this->checkPublishedSchedules($activeSemester)) {
            return $this->buildUnpublishedResponse($activeSemester);
        }

        // Step 2: Prepare queries and fetch data
        $schedulesSub = $this->buildFacultyScheduleSubquery($activeSemester);
        $rows = $this->fetchFacultyWithSchedules($activeSemester, $schedulesSub);
        $faculties = $this->groupFacultySchedules($rows, 'temporary');

        // Step 3: Structure the response
        return response()->json([
            'status'                     => 'published',
            'academic_year'              => $activeSemester->year_start . '-' . 
                                            $activeSemester->year_end,
            'semester'                   => $this->formatSemesterLabel(
                                                $activeSemester->semester
                                            ),
            'start_date'                  => $activeSemester->start_date,
            'end_date'                    => $activeSemester->end_date,
            'temporary_faculty_schedules' => $faculties,
        ]);
    }

    /**
     * For: Faculty Attendance System
     * Returns all rooms
     */
    public function roomsList(Request $request)
    {
        $this->logExternalAccess($request, 'Rooms list');

        $rooms = Room::with('building')
            ->orderBy('room_code')
            ->get()
            ->map(function ($room) {
                return [
                    'room_id' => $room->room_id ?? 'TBA',
                    'room_code' => $room->room_code ?? 'TBA',
                    'building_name' => $room->building?->building_name,
                ];
            });

        return response()->json([
            'rooms' => $rooms,
        ]);
    }

    /**
     * Returns the current active academic year and semester
     * For: Dental Management System (DMS)
     */
    public function academicYearAndSemester()
    {
        $activeSemester = $this->getActiveSemester();

        if ($activeSemester) {
            $academicYearLabel = $activeSemester
                ? $activeSemester->year_start . '-' . $activeSemester->year_end
                : 'N/A';

            return response()->json([
                'academic_year' => $academicYearLabel,
                'year_start' => $activeSemester->year_start,
                'year_end' => $activeSemester->year_end,
                'semester' => $this->formatSemesterLabel($activeSemester->semester),
                'start_date' => $activeSemester->start_date,
                'end_date' => $activeSemester->end_date,
            ]);
        }

        return response()->json([
          'message' => 'No active academic year and semester found'
        ], 404);
    }

    /**
     * For: Faculty Reportorial Requirements System (FRRS)
     * Retrieves course schedules with room codes.
     */
    public function courseSchedules(Request $request)
    {
        $this->logExternalAccess($request, 'Course schedules with rooms');

        // Step 1: Get active semester
        $activeSemester = $this->getActiveSemester();

        if (! $activeSemester) {
            return response()->json(
                ['message' => 'No active semester found.'],
                404
            );
        }

        // Step 2: Check if there are any published schedules
        if (! $this->checkPublishedSchedules($activeSemester)) {
            return $this->buildUnpublishedResponse($activeSemester);
        }

        // Get faculty schedules with room information
        $schedules = Faculty::query()
            ->join('users', 'faculty.user_id', '=', 'users.id')
            ->join('schedules', 'faculty.id', '=', 
                'schedules.faculty_id')
            ->join('section_courses', 
                'schedules.section_course_id', '=', 
                'section_courses.section_course_id')
            ->join('course_assignments', 
                'course_assignments.course_assignment_id', '=', 
                'section_courses.course_assignment_id')
            ->join('courses', 'courses.course_id', '=', 
                'course_assignments.course_id')
            ->join('sections_per_program_year', 
                'sections_per_program_year.sections_per_program_year_id', '=', 
                'section_courses.sections_per_program_year_id')
            ->join('programs', 'programs.program_id', '=', 
                'sections_per_program_year.program_id')
            ->join('semesters as ca_semesters', 
                'ca_semesters.semester_id', '=', 
                'course_assignments.semester_id')
            ->leftJoin('rooms', 'schedules.room_id', '=', 
                'rooms.room_id')
            ->join('faculty_schedule_publication', 
                function ($join) use ($activeSemester) {
                    $join->on(
                        'faculty_schedule_publication.faculty_id', 
                        '=', 
                        'faculty.id'
                    )
                        ->where(
                            'faculty_schedule_publication.academic_year_id',
                            '=',
                            $activeSemester->academic_year_id
                        )
                        ->where(
                            'faculty_schedule_publication.semester_id',
                            '=',
                            $activeSemester->semester_id
                        )
                        ->where(
                            'faculty_schedule_publication.is_published',
                            '=',
                            1
                        );
                })
            ->where('ca_semesters.semester', '=', 
                $activeSemester->semester)
            ->where(
                'sections_per_program_year.academic_year_id', 
                '=', 
                $activeSemester->academic_year_id
            )
            ->whereNotNull('schedules.day')
            ->whereNotNull('schedules.start_time')
            ->whereNotNull('schedules.end_time')
            ->select(
                'schedules.schedule_id as course_schedule_id',
                'faculty.id as faculty_id',
                'users.code as faculty_code',
                'faculty.idp_user_id',
                'programs.program_title as program',
                'programs.program_code',
                'courses.course_code',
                'courses.course_title as course_subjects',
                'sections_per_program_year.year_level',
                'sections_per_program_year.section_name',
                'section_courses.section_course_id',
                'schedules.day',
                'schedules.start_time',
                'schedules.end_time',
                'rooms.room_code',
                'rooms.room_id'
            )
            ->orderBy('faculty.id')
            ->orderBy('section_courses.section_course_id')
            ->orderBy('schedules.day')
            ->orderBy('schedules.start_time')
            ->get();

        // Group schedules by faculty and course
        $groupedSchedules = $schedules->groupBy(function ($schedule) {
            return $schedule->faculty_id . '_' .
                $schedule->course_code . '_' .
                $schedule->year_level . '-' . 
                $schedule->section_name;
        })->map(function ($courseSchedules) use ($activeSemester) {
            $firstSchedule = $courseSchedules->first();

            // Combine all schedules for this course
            $combinedSchedule = $courseSchedules
                ->sortBy(['day', 'start_time'])
                ->map(function ($schedule) {
                    return $schedule->day . ' ' .
                        date("H:i", 
                            strtotime($schedule->start_time)) . 
                        ' - ' .
                        date("H:i", 
                            strtotime($schedule->end_time));
                })->implode(', ');

            return [
                'course_schedule_id' => $firstSchedule->course_schedule_id,
                'faculty_id'         => $firstSchedule->faculty_id,
                'faculty_code'       => $firstSchedule->faculty_code,
                'idp_user_id'        => $firstSchedule->idp_user_id,
                'program_code'       => $firstSchedule->program_code,
                'program'            => $firstSchedule->program,
                'course_code'        => $firstSchedule->course_code,
                'course_subjects'    => $firstSchedule->course_subjects,
                'year_section'       => $firstSchedule->year_level . 
                    '-' . $firstSchedule->section_name,
                'room_id'            => $firstSchedule->room_id ?? 'TBA',
                'room_code'          => $firstSchedule->room_code ?? 'TBA',
                'schedule'           => $combinedSchedule,
                'semester'           => $this->formatSemesterLabel(
                    $activeSemester->semester
                ),
                'school_year'        => $activeSemester->year_start . 
                    '-' . $activeSemester->year_end,
            ];
        })
            ->sortBy('faculty_id')
            ->values();

        return response()->json([
            'course_schedules' => $groupedSchedules,
        ]);
    }

    /**
     * For: Faculty Reportorial Requirements System (FRRS)
     * Retrieves course files for FRRS integration.
     */
    public function courseFiles(Request $request)
    {
        $this->logExternalAccess($request, 'Course files');

        // Step 1: Get active semester
        $activeSemester = $this->getActiveSemester();

        if (! $activeSemester) {
            return response()->json(['message' => 'No active semester found.'], 404);
        }

        // Step 2: Check if there are any published schedules
        if (! $this->checkPublishedSchedules($activeSemester)) {
            return $this->buildUnpublishedResponse($activeSemester);
        }

        // Step 3: Get all course files for published schedules
        $schedulesSub = DB::table('schedules')
            ->join('section_courses', 'schedules.section_course_id', '=', 
                'section_courses.section_course_id')
            ->join('course_assignments', 'course_assignments.course_assignment_id', 
                '=', 'section_courses.course_assignment_id')
            ->join('semesters as ca_semesters', 'ca_semesters.semester_id', '=', 
                'course_assignments.semester_id')
            ->join('sections_per_program_year', 
                'sections_per_program_year.sections_per_program_year_id', '=', 
                'section_courses.sections_per_program_year_id')
            ->join('faculty_schedule_publication', function ($join) use ($activeSemester) {
                $join->on('faculty_schedule_publication.faculty_id', '=', 
                    'schedules.faculty_id')
                    ->where('faculty_schedule_publication.academic_year_id', '=', 
                        $activeSemester->academic_year_id)
                    ->where('faculty_schedule_publication.semester_id', '=', 
                        $activeSemester->semester_id)
                    ->where('faculty_schedule_publication.is_published', '=', 1);
            })
            ->where('ca_semesters.semester', '=', $activeSemester->semester)
            ->where('sections_per_program_year.academic_year_id', '=', 
                $activeSemester->academic_year_id)
            ->select(
                'schedules.schedule_id',
                'schedules.faculty_id',
                'schedules.section_course_id'
            );

        $courseFiles = DB::table('faculty')
            ->join('users', 'faculty.user_id', '=', 'users.id')
            ->leftJoinSub($schedulesSub, 'current_schedules', function ($join) {
                $join->on('current_schedules.faculty_id', '=', 'faculty.id');
            })
            ->leftJoin('section_courses', 'current_schedules.section_course_id', 
                '=', 'section_courses.section_course_id')
            ->leftJoin('course_assignments', 
                'course_assignments.course_assignment_id', '=', 
                'section_courses.course_assignment_id')
            ->leftJoin('courses', 'courses.course_id', '=', 
                'course_assignments.course_id')
            ->leftJoin('faculty_schedule_publication', function ($join) use ($activeSemester) {
                $join->on('faculty_schedule_publication.faculty_id', '=', 'faculty.id')
                    ->where('faculty_schedule_publication.academic_year_id', '=', 
                        $activeSemester->academic_year_id)
                    ->where('faculty_schedule_publication.semester_id', '=', 
                        $activeSemester->semester_id)
                    ->where('faculty_schedule_publication.is_published', '=', 1);
            })
            ->where('faculty_schedule_publication.is_published', '=', 1)
            ->select(
                'faculty.id as faculty_id',
                'faculty.idp_user_id',
                'users.code as faculty_code',
                'current_schedules.schedule_id as course_schedule_id',
                'courses.course_title as subject',
                DB::raw("'" . $this->formatSemesterLabel($activeSemester->semester) . 
                    "' as semester"),
                DB::raw("'" . $activeSemester->year_start . "-" . 
                    $activeSemester->year_end . "' as school_year")
            )
            ->whereNotNull('current_schedules.schedule_id')
            ->distinct()
            ->orderBy('faculty.id')
            ->orderBy('current_schedules.schedule_id')
            ->get();

        return response()->json([
            'courses_files' => $courseFiles,
        ]);
    }

    /**
     * For: Faculty Reportorial Requirements System (FRRS)
     * For: Online Research Repository (ORR)
     * Returns a list of all faculty members with their details
     */
    public function facultyList(Request $request)
    {
        $clientSystem = $this->logExternalAccess($request, 'Faculty list');

        $faculties = DB::table('faculty')
            ->join('users', 'faculty.user_id', '=', 'users.id')
            ->join('faculty_type', 'faculty.faculty_type_id', '=', 'faculty_type.faculty_type_id')
            ->select(
                'faculty.id as faculty_id',
                'faculty.idp_user_id',
                'users.id as user_id',
                'users.code as faculty_code',
                'users.last_name',
                'users.first_name',
                'users.middle_name',
                'users.suffix_name',
                'faculty_type.faculty_type',
                'faculty_type.regular_units',
                'users.email',
                'users.status'
            )
            ->orderBy('users.last_name')
            ->orderBy('users.first_name')
            ->get();

        // Get assigned units for each faculty
        $rows = DB::table('schedules')
            ->join('section_courses', 'schedules.section_course_id', '=', 'section_courses.section_course_id')
            ->join('course_assignments', 'section_courses.course_assignment_id', '=', 'course_assignments.course_assignment_id')
            ->join('courses', 'course_assignments.course_id', '=', 'courses.course_id')
            ->select('schedules.faculty_id', 'course_assignments.course_assignment_id', 'courses.units')
            ->distinct()
            ->get();

        $assignedUnits = $rows->groupBy('faculty_id')->map(fn($items) => (int) $items->sum('units'))->toArray();

        $formattedFaculties = $faculties->map(function ($faculty) use ($clientSystem, $assignedUnits) {
            // Format assigned units as integer, defaulting to 0 if not found
            $facultyAssignedUnits = (int) ($assignedUnits[$faculty->faculty_id] ?? 0);

            $data = [
                'faculty_id'    => $faculty->faculty_id,
                'idp_user_id'   => $faculty->idp_user_id,
                'first_name'    => $faculty->first_name,
                'middle_name'   => $faculty->middle_name,
                'last_name'     => $faculty->last_name,
                'suffix_name'   => $faculty->suffix_name ?? null,
                'faculty_code'  => $faculty->faculty_code,
                'faculty_type'  => $faculty->faculty_type,
                'email'         => $faculty->email,
                'status'        => $faculty->status,                
                'assigned_units'=> $facultyAssignedUnits,
                'regular_units' => $faculty->regular_units
            ];
            return $data;
        });

        return response()->json([
            'system' => $clientSystem,
            'faculties' => $formattedFaculties,
        ]);
    }

    /**
     * For: Dental Management System (DMS)
     * For: Online Clinic Management System (OCMS)
     * Returns faculty list with details for DMS and OCMS integration.
     */
    public function facultyProfiles(Request $request) {
        $clientSystem = $this->logExternalAccess($request, 'Faculty profiles');

        $faculties = UserProfile::with(['user.faculty.facultyType'])
            ->get()
            ->filter(function ($profile) {
                // Filter out profiles with missing required relationships before sorting
                return !empty($profile->user) && !empty($profile->user->faculty);
            })
            ->sortBy([
                fn($profile) => $profile->user->last_name,
                fn($profile) => $profile->user->first_name,
            ]);

        $formattedFaculties = $faculties->map(function ($profile) {
            // Skip profiles missing required relationships
            if (!$profile->user || !$profile->user->faculty) {
                Log::warning('Skipping UserProfile with missing faculty or user relationship', [
                    'user_profile_id' => $profile->user_profile_id ?? 'unknown',
                    'has_user' => !empty($profile->user),
                    'has_faculty' => !empty($profile->user?->faculty),
                ]);
                return null;
            }

            if (!$profile->user->faculty->facultyType) {
                Log::warning('Skipping UserProfile with missing facultyType relationship', [
                    'faculty_id' => $profile->user->faculty->id ?? 'unknown',
                    'user_id' => $profile->user->id ?? 'unknown',
                ]);
                return null;
            }

            $user = $profile->user;
            $faculty = $user->faculty;
            
            $department = $profile->department;

            // If department is missing, try to infer it and save it permanently
            if (empty($department)) {
                $department = $this->assignDepartmentFromSchedules($profile);
            }

            $data = [
                'faculty_id'    => $user->id,
                'idp_user_id'   => $faculty->idp_user_id,
                'first_name'    => $user->first_name,
                'middle_name'   => $user->middle_name,
                'last_name'     => $user->last_name,
                'suffix_name'   => $user->suffix_name ?? null,
                'faculty_code'  => $user->code,
                'faculty_type'  => $faculty->facultyType->faculty_type,
                'department'    => $department,
                'email'         => $user->email,
                'status'        => $user->status
            ];

            // Faculty Profile Data with address as separate fields
            $data['profile'] = [
                'birthday'   => $profile->getBirthdayAttribute(),
                'gender'     => $profile->sex ?? null,
                'address' => [
                    'house_num' => $profile->house_num ?? null,
                    'street'    => $profile->street ?? null,
                    'barangay'  => $profile->barangay ?? null,
                    'city'      => $profile->city ?? null,
                    'province'  => $profile->province ?? null,
                    'country'   => $profile->country ?? null,
                    'zipcode'   => $profile->zipcode ?? null,
                ],
            ];

            return $data;
        })->filter()->values();

        return response()->json([
            'system' => $clientSystem,
            'faculties' => $formattedFaculties,
        ]);
    }

    /**
     * For: Accreditation System (Accred)
     * Returns a list of faculties grouped by their respective departments 
     */
    public function departmentList(Request $request)
    {
        $this->logExternalAccess($request, 'Department list');

        $faculties = UserProfile::with(['user.faculty.facultyType'])
            ->get()
            ->filter(function ($profile) {
                // Filter out profiles with missing required relationships before sorting
                return !empty($profile->user) && !empty($profile->user->faculty);
            })
            ->sortBy([
                fn($profile) => $profile->user->last_name,
                fn($profile) => $profile->user->first_name,
            ]);

        // If any faculty profile is missing a department, try to infer it
        foreach ($faculties as $profile) {
            if (empty($profile->department)) {
                $this->assignDepartmentFromSchedules($profile);
            }
        }        

        // Group faculties by department. Profiles without one go under 'Unspecified'
        $departmentGroups = $faculties->groupBy(function ($profile) {
            return $profile->department ?? 'Unspecified';
        })->map(function ($departmentFaculties) {
            return $departmentFaculties->map(function ($profile) {
                // Skip profiles missing required relationships
                if (!$profile->user || !$profile->user->faculty) {
                    Log::warning('Skipping UserProfile with missing faculty or user relationship in departmentList', [
                        'user_profile_id' => $profile->user_profile_id ?? 'unknown',
                        'has_user' => !empty($profile->user),
                        'has_faculty' => !empty($profile->user?->faculty),
                    ]);
                    return null;
                }

                if (!$profile->user->faculty->facultyType) {
                    Log::warning('Skipping UserProfile with missing facultyType relationship in departmentList', [
                        'faculty_id' => $profile->user->faculty->id ?? 'unknown',
                        'user_id' => $profile->user->id ?? 'unknown',
                    ]);
                    return null;
                }

                $user = $profile->user;
                $faculty = $user->faculty;

                return [
                    'faculty_id'    => $user->id,
                    'idp_user_id'   => $faculty->idp_user_id,
                    'first_name'    => $user->first_name,
                    'middle_name'   => $user->middle_name,
                    'last_name'     => $user->last_name,
                    'suffix_name'   => $user->suffix_name ?? null,
                    'faculty_code'  => $user->code,
                    'faculty_type'  => $faculty->facultyType->faculty_type,
                    'email'         => $user->email,
                    'status'        => $user->status,
                ];
            })->filter()->values();
        });

        return response()->json([
            'departments' => $departmentGroups,
        ]);
    }

    /**
     * Attempt to infer a faculty's department by inspecting their schedules.
     * If found, it permanently updates the department in the database.
     *
     * @param  \App\Models\UserProfile  $profile
     * @return string|null
     */
    private function assignDepartmentFromSchedules(UserProfile $profile): ?string
    {
        $facultyId = $profile->user?->faculty?->id;

        if (! $facultyId) {
            return null;
        }

        // Find the most frequently occurring program for this faculty's schedules
        $programRow = DB::table('schedules')
            ->join('section_courses', 'schedules.section_course_id', '=', 
                'section_courses.section_course_id')
            ->join('sections_per_program_year', 'section_courses.sections_per_program_year_id', '=', 
                'sections_per_program_year.sections_per_program_year_id')
            ->join('programs', 'sections_per_program_year.program_id', '=', 
                'programs.program_id')
            ->where('schedules.faculty_id', $facultyId)
            ->select('programs.program_title', DB::raw('COUNT(programs.program_id) as cnt'))
            ->groupBy('programs.program_title')
            ->orderByDesc('cnt')
            ->first();

        if (! $programRow) {
            return null;
        }

        // Permanently save the department to the profile
        $profile->update(['department' => $programRow->program_title]);

        return $programRow->program_title;
    }

    /**
     * For: Biometric Synchronization System (BioSync)
     * Retrieves computer laboratory schedules for BioSync integration.
     * Returns schedules for rooms with room_type "Computer Laboratory" for the current active semester.
     * (Deprecated)
     */

    /**
     * Room type ID for Computer Laboratory
     */
    private const COMPUTER_LABORATORY_ID = 3;

    public function labSchedules(Request $request)
    {
        $this->logExternalAccess($request, 'Computer laboratory schedules');

        // Step 1: Get active semester
        $activeSemester = $this->getActiveSemester();

        if (! $activeSemester) {
            return response()->json(['message' => 'No active semester found.'], 404);
        }

        // Step 2: Get all computer laboratory schedules with related data
        $query = DB::table('rooms')
            ->join('room_types', 'rooms.room_type_id', '=', 
                'room_types.room_type_id')
            ->join('buildings', 'rooms.building_id', '=', 
                'buildings.building_id')
            ->join('schedules', 'rooms.room_id', '=', 'schedules.room_id')
            ->join('faculty', 'schedules.faculty_id', '=', 'faculty.id')
            ->join('users', 'faculty.user_id', '=', 'users.id')
            ->join('section_courses', 'schedules.section_course_id', '=', 
                'section_courses.section_course_id')
            ->join('course_assignments', 
                'section_courses.course_assignment_id', '=', 
                'course_assignments.course_assignment_id')
            ->join('courses', 'course_assignments.course_id', '=', 
                'courses.course_id')
            ->join('sections_per_program_year', 
                'section_courses.sections_per_program_year_id', '=', 
                'sections_per_program_year.sections_per_program_year_id')
            ->join('programs', 'sections_per_program_year.program_id', '=', 
                'programs.program_id')
            ->join('faculty_schedule_publication', function ($join) use ($activeSemester) {
                $join->on('faculty_schedule_publication.faculty_id', '=', 
                    'faculty.id')
                    ->where('faculty_schedule_publication.academic_year_id', '=', 
                        $activeSemester->academic_year_id)
                    ->where('faculty_schedule_publication.semester_id', '=', 
                        $activeSemester->semester_id)
                    ->where('faculty_schedule_publication.is_published', '=', 1);
            })
            ->where('rooms.room_type_id', '=', self::COMPUTER_LABORATORY_ID)
            ->where('sections_per_program_year.academic_year_id', '=', 
                $activeSemester->academic_year_id)
            ->select(
                'rooms.room_id',
                'rooms.room_code',
                'buildings.building_name as location',
                'rooms.floor_level',
                'rooms.capacity',
                'schedules.schedule_id',
                'schedules.day',
                'schedules.start_time',
                'schedules.end_time',
                'users.code as faculty_code',
                DB::raw("CONCAT(users.last_name, ', ', users.first_name,
                    CASE WHEN users.middle_name IS NOT NULL THEN CONCAT(' ', users.middle_name) ELSE '' END,
                    CASE WHEN users.suffix_name IS NOT NULL THEN CONCAT(' ', users.suffix_name) ELSE '' END)
                    as faculty_name"),
                'programs.program_code',
                'programs.program_title',
                'sections_per_program_year.year_level',
                'sections_per_program_year.section_name',
                'courses.course_id',
                'courses.course_title',
                'courses.course_code',
                'courses.lec_hours as lec',
                'courses.lab_hours as lab',
                'courses.units',
                'courses.tuition_hours'
            )
            ->orderBy('rooms.room_code')
            ->orderBy('schedules.day')
            ->orderBy('schedules.start_time');

        $labSchedules = $query->get();

        // Step 3: Group schedules by room
        $rooms = $labSchedules->groupBy('room_id')->map(function ($roomSchedules) {
            $firstSchedule = $roomSchedules->first();
            return [
                'room_code'   => $firstSchedule->room_code,
                'location'    => $firstSchedule->location,
                'floor_level' => $firstSchedule->floor_level,
                'capacity'    => $firstSchedule->capacity,
                'schedules'   => $roomSchedules->map(function ($schedule) {
                    return [
                        'schedule_id'    => $schedule->schedule_id,
                        'day'            => $schedule->day,
                        'start_time'     => $schedule->start_time,
                        'end_time'       => $schedule->end_time,
                        'faculty_name'   => $schedule->faculty_name,
                        'faculty_code'   => $schedule->faculty_code,
                        'program_code'   => $schedule->program_code,
                        'program_title'  => $schedule->program_title,
                        'year_level'     => $schedule->year_level,
                        'section_name'   => $schedule->section_name,
                        'course_details' => [
                            'course_id'     => $schedule->course_id,
                            'course_title'  => $schedule->course_title,
                            'course_code'   => $schedule->course_code,
                            'lec'           => $schedule->lec,
                            'lab'           => $schedule->lab,
                            'units'         => $schedule->units,
                            'tuition_hours' => $schedule->tuition_hours,
                        ],
                    ];
                })->values()->all(),
            ];
        })->values();

        return response()->json([
            'computer_laboratory_schedules' => [
                'academic_year_start' => $activeSemester->year_start,
                'academic_year_end'   => $activeSemester->year_end,
                'semester'            => $activeSemester->semester,
                'rooms'               => $rooms,
            ],
        ]);
    }

    // -------------------------
    // Helper Functions
    // -------------------------

    /**
     * Retrieves the current active semester with academic year details.
     * 
     * @return object|null
     */
    private function getActiveSemester()
    {
        // NOTE: Replace the condition to switch the active semester logic 
        // by viewing based on the faculty view instead
        // ->where('active_semesters.is_faculty_view', 1)

        return DB::table('active_semesters')
            ->join('academic_years', 'active_semesters.academic_year_id', '=', 'academic_years.academic_year_id')
            ->join('semesters', 'active_semesters.semester_id', '=', 'semesters.semester_id')
            ->where('active_semesters.is_active', 1)
            ->select(
                'academic_years.year_start',
                'academic_years.year_end',
                'semesters.semester',
                'active_semesters.academic_year_id',
                'active_semesters.semester_id',
                'active_semesters.active_semester_id',
                'active_semesters.start_date',
                'active_semesters.end_date'
            )
            ->first();
    }

    /**
     * Checks if there are any published schedules for the active semester.
     *
     * @param  object  $activeSemester
     * @return bool
     */
    private function checkPublishedSchedules($activeSemester): bool
    {
        return DB::table('faculty_schedule_publication')
            ->where('faculty_schedule_publication.academic_year_id', $activeSemester->academic_year_id)
            ->where('faculty_schedule_publication.semester_id', $activeSemester->semester_id)
            ->where('faculty_schedule_publication.is_published', 1)
            ->exists();
    }

    /**
     * Builds the standardized unpublished response.
     *
     * @param  object  $activeSemester
     * @return \Illuminate\Http\JsonResponse
     */
    private function buildUnpublishedResponse($activeSemester)
    {
        return response()->json([
            'status' => 'unpublished',
            'message' => "PUP Taguig faculty load and schedules for " . "A.Y. " .
            $activeSemester->year_start . "-" . $activeSemester->year_end .
            ", " . $this->formatSemesterLabel($activeSemester->semester) .
            " is not yet published.",
        ]);
    }

    /**
     * Logs and audits an external system access event.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  string  $resource
     * @return string
     */
    private function logExternalAccess(Request $request, string $resource): string
    {
        $clientSystem = $request->attributes->get('client_system') ?? 'Unknown System';

        Log::info("{$resource} accessed by external system: {$clientSystem}", 
          ['ip' => $request->ip()]);

        AuditLogger::log(
            action: 'view',
            description: "{$resource} accessed by external system: {$clientSystem}",
            metadata: ['client_system' => $clientSystem]
        );

        return $clientSystem;
    }

    /**
     * Builds the faculty schedule subquery for the given active semester.
     *
     * @param  object  $activeSemester
     * @return \Illuminate\Database\Query\Builder
     */
    private function buildFacultyScheduleSubquery($activeSemester)
    {
        return DB::table('schedules')
            ->join('section_courses', 'schedules.section_course_id', '=', 
                'section_courses.section_course_id')
            ->join('course_assignments', 'course_assignments.course_assignment_id', 
                '=', 'section_courses.course_assignment_id')
            ->join('semesters as ca_semesters', 'ca_semesters.semester_id', '=', 
                'course_assignments.semester_id')
            ->join('sections_per_program_year', 
                'sections_per_program_year.sections_per_program_year_id', '=', 
                'section_courses.sections_per_program_year_id')
            ->join('faculty_schedule_publication', function ($join) use ($activeSemester) {
                $join->on('faculty_schedule_publication.faculty_id', '=', 
                    'schedules.faculty_id')
                    ->where('faculty_schedule_publication.academic_year_id', '=', 
                        $activeSemester->academic_year_id)
                    ->where('faculty_schedule_publication.semester_id', '=', 
                        $activeSemester->semester_id)
                    ->where('faculty_schedule_publication.is_published', '=', 1);
            })
            ->where('ca_semesters.semester', '=', $activeSemester->semester)
            ->where('sections_per_program_year.academic_year_id', '=', 
                $activeSemester->academic_year_id)
            ->select(
                'schedules.schedule_id',
                'schedules.faculty_id',
                'schedules.day',
                'schedules.start_time',
                'schedules.end_time',
                'schedules.room_id',
                'schedules.section_course_id'
            );
    }

    /**
     * Fetches raw faculty data with their schedules for the active semester.
     *
     * @param  object  $activeSemester
     * @param  \Illuminate\Database\Query\Builder  $schedulesSub
     * @return \Illuminate\Support\Collection
     */
    private function fetchFacultyWithSchedules($activeSemester, $schedulesSub)
    {
        return DB::table('faculty')
            ->join('users', 'faculty.user_id', '=', 'users.id')
            ->join('faculty_type', 'faculty.faculty_type_id', '=', 
                'faculty_type.faculty_type_id')
            ->leftJoinSub($schedulesSub, 'current_schedules', function ($join) {
                $join->on('current_schedules.faculty_id', '=', 'faculty.id');
            })
            ->leftJoin('section_courses', 'current_schedules.section_course_id', 
                '=', 'section_courses.section_course_id')
            ->leftJoin('sections_per_program_year', 
                'sections_per_program_year.sections_per_program_year_id', '=', 
                'section_courses.sections_per_program_year_id')
            ->leftJoin('programs', 'programs.program_id', '=', 
                'sections_per_program_year.program_id')
            ->leftJoin('course_assignments', 
                'course_assignments.course_assignment_id', '=', 
                'section_courses.course_assignment_id')
            ->leftJoin('courses', 'courses.course_id', '=', 
                'course_assignments.course_id')
            ->leftJoin('rooms', 'rooms.room_id', '=', 
                'current_schedules.room_id')
            ->leftJoin('faculty_schedule_publication', function ($join) use ($activeSemester) {
                $join->on('faculty_schedule_publication.faculty_id', '=', 
                    'faculty.id')
                    ->where('faculty_schedule_publication.academic_year_id', '=', 
                        $activeSemester->academic_year_id)
                    ->where('faculty_schedule_publication.semester_id', '=', 
                        $activeSemester->semester_id);
            })
            ->select(
                'faculty.id as faculty_id',
                'faculty.idp_user_id',
                'users.id as user_id',
                'users.code as faculty_code',
                'faculty_type.faculty_type',
                'current_schedules.schedule_id',
                'current_schedules.day',
                'current_schedules.start_time',
                'current_schedules.end_time',
                'rooms.room_code',
                'course_assignments.course_assignment_id',
                'courses.course_title',
                'courses.course_code',
                'courses.lec_hours',
                'courses.lab_hours',
                'courses.units',
                'courses.tuition_hours',
                'programs.program_code',
                'programs.program_title',
                'sections_per_program_year.year_level',
                'sections_per_program_year.section_name',
                DB::raw('IFNULL(faculty_schedule_publication.is_published, 0) as is_published')
            )
            ->get();
    }

    /**
     * Groups raw faculty schedule rows into the standardized structure.
     *
     * @param  \Illuminate\Support\Collection  $facultySchedules
     * @param  string  $typeFilter
     * @return array
     */
    private function groupFacultySchedules($facultySchedules, string $typeFilter)
    {
        $userIds = $facultySchedules->pluck('user_id')->unique()->toArray();
        $users = User::whereIn('id', $userIds)->get()->keyBy('id');

        $faculties = [];

        foreach ($facultySchedules as $schedule) {
            if ($schedule->schedule_id) {
                if (strtolower($schedule->faculty_type) !== strtolower($typeFilter)) {
                    continue;
                }

                if (! isset($faculties[$schedule->faculty_id])) {
                    $faculties[$schedule->faculty_id] = [
                        'faculty_id'      => $schedule->faculty_id,
                        'idp_user_id'     => $schedule->idp_user_id,
                        'faculty_email'   => $users[$schedule->user_id]->email ?? null,
                        'last_name'       => $users[$schedule->user_id]->last_name ?? null,
                        'first_name'      => $users[$schedule->user_id]->first_name ?? null,
                        'middle_name'     => $users[$schedule->user_id]->middle_name ?? null,
                        'suffix_name'     => $users[$schedule->user_id]->suffix_name ?? null,
                        'faculty_code'    => $schedule->faculty_code,
                        'faculty_type'    => $schedule->faculty_type,
                        'assigned_units'  => 0,
                        'schedules'       => [],
                        'tracked_courses' => [],
                    ];
                }

                if (! in_array($schedule->course_assignment_id, $faculties[$schedule->faculty_id]['tracked_courses'])) {
                    $faculties[$schedule->faculty_id]['assigned_units'] += $schedule->units;
                    $faculties[$schedule->faculty_id]['tracked_courses'][] = $schedule->course_assignment_id;
                }

                $faculties[$schedule->faculty_id]['schedules'][] = [
                    'day'                  => $schedule->day,
                    'start_time'           => $schedule->start_time,
                    'end_time'             => $schedule->end_time,
                    'room_code'            => $schedule->room_code,
                    'program_code'         => $schedule->program_code,
                    'program_title'        => $schedule->program_title,
                    'year_level'           => $schedule->year_level,
                    'section_name'         => $schedule->section_name,
                    'course_title'         => $schedule->course_title,
                    'course_code'          => $schedule->course_code,
                    'units'                => $schedule->units,
                    'tuition_hours'        => $schedule->tuition_hours,
                ];
            }
        }

        foreach ($faculties as &$faculty) {
            unset($faculty['tracked_courses']);
        }

        return collect($faculties)->sortBy('last_name')->values()->all();
    }

    /**
     * Helper method
     * Converts semester number to readable text format.
     */
    private function formatSemesterLabel(int $semesterNumber): string
    {
        return match ($semesterNumber) {
            1 => 'First Semester',
            2 => 'Second Semester',
            3 => 'Summer Semester',
            default => 'Unknown Semester'
        };
    }
}
