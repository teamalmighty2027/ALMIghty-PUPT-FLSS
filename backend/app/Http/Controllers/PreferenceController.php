<?php
namespace App\Http\Controllers;

use App\Jobs\NotifyAdminOfPreferenceChangeJob;
use App\Jobs\SendFacultyPreferenceEmailJob;
use App\Models\ActiveSemester;
use App\Models\AcademicYear;
use App\Models\Faculty;
use App\Models\Preference;
use App\Models\PreferenceDay;
use App\Models\PreferencesSetting;
use App\Models\User;
use App\Services\AuditLogger;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class PreferenceController extends Controller
{
    /**
     * Submits a single faculty preference and updates existing entries.
     */
    public function submitPreferences(Request $request)
    {
        $validatedData = $request->validate([
            'faculty_id'                  => 'required|exists:faculty,id',
            'active_semester_id'          => 'required|exists:active_semesters,active_semester_id',
            'course_assignment_id'        => 'nullable|exists:course_assignments,course_assignment_id',
            'temporary_course_offering_id'=> 'nullable|exists:temporary_course_offerings,temporary_course_offering_id',
            'sections_per_program_year_id'=> 'required|exists:sections_per_program_year,sections_per_program_year_id',
            'preferred_days'              => 'required|array',
            'preferred_days.*.day'        => 'required|in:Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
            'preferred_days.*.start_time' => 'required|date_format:H:i:s',
            'preferred_days.*.end_time'   => 'required|date_format:H:i:s',
        ]);

        $facultyId          = $validatedData['faculty_id'];
        $activeSemesterId   = $validatedData['active_semester_id'];
        $courseAssignmentId = $validatedData['course_assignment_id'] ?? null;
        $temporaryCourseOfferingId = $validatedData['temporary_course_offering_id'] ?? null;
        $sectionsPerProgramYearId = $validatedData['sections_per_program_year_id'];
        $preferenceSetting  = PreferencesSetting::where('faculty_id', $facultyId)->first();
        $globalDeadline     = $preferenceSetting->global_deadline;
        $individualDeadline = $preferenceSetting->individual_deadline;

        $currentDate = Carbon::now();
        $deadline    = $individualDeadline ?? $globalDeadline;

        if ($preferenceSetting->is_enabled == 0 || ($deadline && $currentDate->greaterThan(Carbon::parse($deadline)->endOfDay()))) {
            return response()->json([
                'message' => 'Submission is now closed. You cannot submit preferences anymore.',
            ], 403);
        }

        if (($courseAssignmentId && $temporaryCourseOfferingId) || (! $courseAssignmentId && ! $temporaryCourseOfferingId)) {
            return response()->json([
                'message' => 'Provide either course_assignment_id or temporary_course_offering_id, but not both.',
            ], 422);
        }

        if ($temporaryCourseOfferingId) {
            $activeSemester = ActiveSemester::where('active_semester_id', $activeSemesterId)->first();

            if (! $activeSemester) {
                return response()->json([
                    'message' => 'Invalid active semester provided.',
                ], 422);
            }

            $temporaryOffering = DB::table('temporary_course_offerings')
                ->where('temporary_course_offering_id', $temporaryCourseOfferingId)
                ->where('academic_year_id', $activeSemester->academic_year_id)
                ->where('semester_id', $activeSemester->semester_id)
                ->where('is_archived', 0)
                ->where('status', 'Approved')
                ->first();

            if (! $temporaryOffering) {
                return response()->json([
                    'message' => 'Temporary course offering is not available for this semester.',
                ], 422);
            }
        }

        $preferenceRecord = null;
        $isUpdate = false;

        DB::transaction(function () use ($validatedData, $facultyId, $activeSemesterId, $courseAssignmentId, $temporaryCourseOfferingId, $sectionsPerProgramYearId, &$preferenceRecord, &$isUpdate) {
            
            $existingPreference = Preference::where([
                'faculty_id' => $facultyId,
                'active_semester_id' => $activeSemesterId,
                'course_assignment_id' => $courseAssignmentId,
                'temporary_course_offering_id' => $temporaryCourseOfferingId,
                'sections_per_program_year_id' => $sectionsPerProgramYearId,
            ])->first();

            $isUpdate = $existingPreference ? true : false;

            $preference = Preference::updateOrCreate(
                [
                    'faculty_id'                   => $facultyId,
                    'active_semester_id'           => $activeSemesterId,
                    'course_assignment_id'         => $courseAssignmentId,
                    'temporary_course_offering_id' => $temporaryCourseOfferingId,
                    'sections_per_program_year_id' => $sectionsPerProgramYearId,
                ]
            );

            // Check if preferred days have changed
            $existingDays = PreferenceDay::where('preference_id', $preference->preferences_id)
                ->orderBy('preferred_day')
                ->get()
                ->map(function ($day) {
                    return [
                        'day'        => $day->preferred_day,
                        'start_time' => $day->preferred_start_time,
                        'end_time'   => $day->preferred_end_time,
                    ];
                })->toArray();

            $newDays = $validatedData['preferred_days'];
            usort($newDays, function ($a, $b) {
                return $a['day'] <=> $b['day'];
            });

            if ($existingDays !== $newDays) {
                // Delete existing days for this preference
                PreferenceDay::where('preference_id', $preference->preferences_id)->delete();

                // Create new preference days with start and end times
                foreach ($newDays as $dayData) {
                    PreferenceDay::create([
                        'preference_id'        => $preference->preferences_id,
                        'preferred_day'        => $dayData['day'],
                        'preferred_start_time' => $dayData['start_time'],
                        'preferred_end_time'   => $dayData['end_time'],
                    ]);
                }
            }

            $preferenceRecord = $preference;
        });

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Preference Submitted/Updated
        // ═══════════════════════════════════════════════════════
        $facultyUser = User::whereHas('faculty', function($q) use ($facultyId) {
            $q->where('id', $facultyId);
        })->first();
        $facultyName = $facultyUser ? $facultyUser->formatted_name : "Faculty ID: {$facultyId}";

        $courseReference = $courseAssignmentId
            ? "Course Assignment ID: {$courseAssignmentId}"
            : "Temporary Offering ID: {$temporaryCourseOfferingId}";

        if ($isUpdate) {
            AuditLogger::logUpdate(
                model: 'Preference',
                modelId: $preferenceRecord->preferences_id,
                oldData: [], // Days comparison is too complex for basic Old/New array, stick to description
                newData: ['days' => $validatedData['preferred_days']],
                description: "Updated schedule preference for {$facultyName} ({$courseReference})"
            );
        } else {
            AuditLogger::logCreate(
                model: 'Preference',
                modelId: $preferenceRecord->preferences_id,
                data: $validatedData,
                description: "Submitted new schedule preference for {$facultyName}"
            );
        }

        return response()->json([
            'message' => 'Preference submitted successfully',
        ], 201);
    }

    /**
     * Retrieves all unique faculty preferences for the active year and semester.
     * In this context, 'unique' means it returns only one instance of a course,
     * a.k.a. the actual selected preference of the faculty
     */
    public function getUniqueFacultyPreferences()
    {
        // ... Keep exactly as is ...
        $activeSemester = ActiveSemester::with(['academicYear', 'semester'])
            ->where('is_active', 1)
            ->first();

        if (! $activeSemester) {
            return response()->json(['error' => 'No active semester found'], 404);
        }

        $faculty = Faculty::with(['user', 'preferenceSetting'])
            ->whereHas('user', function ($query) {
                $query->where('status', 'Active');
            })
            ->leftJoin('preferences', function ($join) use ($activeSemester) {
                $join->on('faculty.id', '=', 'preferences.faculty_id')
                    ->where('preferences.active_semester_id', $activeSemester->active_semester_id);
            })
            ->leftJoin('sections_per_program_year', 'preferences.sections_per_program_year_id', '=', 'sections_per_program_year.sections_per_program_year_id')
            ->leftJoin('course_assignments', 'preferences.course_assignment_id', '=', 'course_assignments.course_assignment_id')
            ->leftJoin('courses', 'course_assignments.course_id', '=', 'courses.course_id')
            ->select('faculty.*', 'preferences.*', 'course_assignments.*', 'courses.*', 'sections_per_program_year.year_level as pref_year_level', 'sections_per_program_year.section_name as pref_section_name')
            ->get();

        $temporaryOfferingIds = $faculty->pluck('temporary_course_offering_id')->filter()->unique()->values();
        $temporaryOfferingsById = collect();
        if ($temporaryOfferingIds->isNotEmpty()) {
            $temporaryOfferingsById = DB::table('temporary_course_offerings as tco')
                ->join('courses as co', 'tco.course_id', '=', 'co.course_id')
                ->join('programs as p', 'tco.program_id', '=', 'p.program_id')
                ->select(
                    'tco.*',
                    'co.course_code',
                    'co.course_title',
                    'co.lec_hours',
                    'co.lab_hours',
                    'co.units',
                    'p.program_code'
                )
                ->whereIn('tco.temporary_course_offering_id', $temporaryOfferingIds)
                ->get()
                ->keyBy('temporary_course_offering_id');
        }

        $facultyPreferences = $faculty->groupBy('id')->map(function ($facultyGroup) use ($activeSemester, $temporaryOfferingsById) {
            $faculty           = $facultyGroup->first();
            $facultyUser       = $faculty->user;
            $preferenceSetting = $faculty->preferenceSetting;

            $courses = $facultyGroup->map(function ($preference) use ($temporaryOfferingsById) {
                if ($preference->course_assignment_id) {
                    $preferenceDays = PreferenceDay::where('preference_id', $preference->preferences_id)
                        ->orderBy('preferred_day')
                        ->get()
                        ->map(function ($day) {
                            return [
                                'day'        => $day->preferred_day,
                                'start_time' => $day->preferred_start_time,
                                'end_time'   => $day->preferred_end_time,
                            ];
                        })->values()->toArray();

                    $program_details = DB::table('course_assignments')
                        ->join('curricula_program', 'course_assignments.curricula_program_id', '=', 'curricula_program.curricula_program_id')
                        ->join('programs', 'curricula_program.program_id', '=', 'programs.program_id')
                        ->where('course_assignments.course_assignment_id', $preference->course_assignment_id)
                        ->select('programs.program_id', 'programs.program_code')
                        ->first();

                    return ($preference->is_ignored) ? collect() : [
                        'course_assignment_id' => $preference->course_assignment_id ?? 'N/A',
                        'preferences_id'       => $preference->preferences_id,
                        'is_ignored'           => (bool) $preference->is_ignored,
                        'temporary_course_offering_id' => null,
                        'course_details'       => [
                            'course_id'    => $preference->course_id ?? 'N/A',
                            'course_code'  => $preference->course_code ?? null,
                            'course_title' => $preference->course_title ?? null,
                            'year_level'   => $preference->pref_year_level ?? null,
                            'section_id'   => $preference->sections_per_program_year_id ?? null,
                            'section_name' => $preference->pref_section_name ?? null,
                            'program_id'   => $program_details->program_id ?? null,
                            'program_code' => $program_details->program_code ?? null,
                        ],
                        'lec_hours'            => is_numeric($preference->lec_hours) ? (int) $preference->lec_hours : 0,
                        'lab_hours'            => is_numeric($preference->lab_hours) ? (int) $preference->lab_hours : 0,
                        'units'                => $preference->units ?? 0,
                        'preferred_days'       => $preferenceDays,
                        'is_temporary'          => false,
                        'temporary_type'        => null,
                        'temporary_status'      => null,
                        'petition_required'     => false,
                        'created_at'           => $preference->created_at ? Carbon::parse($preference->created_at)->toDateTimeString() : 'N/A',
                        'updated_at'           => $preference->updated_at ? Carbon::parse($preference->updated_at)->toDateTimeString() : 'N/A',
                    ];
                }
                if ($preference->temporary_course_offering_id) {
                    if ($preference->is_ignored) {
                        return collect();
                    }

                    $temporaryOffering = $temporaryOfferingsById->get($preference->temporary_course_offering_id);

                    if (! $temporaryOffering) {
                        return collect();
                    }

                    $preferenceDays = PreferenceDay::where('preference_id', $preference->preferences_id)
                        ->orderBy('preferred_day')
                        ->get()
                        ->map(function ($day) {
                            return [
                                'day'        => $day->preferred_day,
                                'start_time' => $day->preferred_start_time,
                                'end_time'   => $day->preferred_end_time,
                            ];
                        })->values()->toArray();

                    return [
                        'course_assignment_id' => null,
                        'preferences_id'       => $preference->preferences_id,
                        'is_ignored'           => (bool) $preference->is_ignored,
                        'temporary_course_offering_id' => $temporaryOffering->temporary_course_offering_id,
                        'course_details'       => [
                            'course_id'    => $temporaryOffering->course_id ?? 'N/A',
                            'course_code'  => $temporaryOffering->course_code ?? null,
                            'course_title' => $temporaryOffering->course_title ?? null,
                            'year_level'   => $temporaryOffering->year_level ?? $preference->pref_year_level ?? null,
                            'section_id'   => $preference->sections_per_program_year_id ?? null,
                            'section_name' => $preference->pref_section_name ?? null,
                            'program_id'   => $temporaryOffering->program_id ?? null,
                            'program_code' => $temporaryOffering->program_code ?? null,
                        ],
                        'lec_hours'            => is_numeric($temporaryOffering->lec_hours) ? (int) $temporaryOffering->lec_hours : 0,
                        'lab_hours'            => is_numeric($temporaryOffering->lab_hours) ? (int) $temporaryOffering->lab_hours : 0,
                        'units'                => $temporaryOffering->units ?? 0,
                        'preferred_days'       => $preferenceDays,
                        'is_temporary'          => true,
                        'temporary_type'        => $temporaryOffering->type ?? null,
                        'temporary_status'      => $temporaryOffering->status ?? null,
                        'petition_required'     => in_array($temporaryOffering->type, ['petition', 'tutorial'], true),
                        'created_at'           => $preference->created_at ? Carbon::parse($preference->created_at)->toDateTimeString() : 'N/A',
                        'updated_at'           => $preference->updated_at ? Carbon::parse($preference->updated_at)->toDateTimeString() : 'N/A',
                    ];
                }
                return [];
            })->filter();

            return [
                'faculty_id'       => $faculty->id,
                'faculty_name'     => $facultyUser->formatted_name ?? 'N/A',
                'faculty_code'     => $facultyUser->code ?? 'N/A',
                'faculty_type'     => $faculty->facultyType->faculty_type ?? 'N/A',
                'faculty_units'    => $faculty->faculty_units,
                'has_request'      => (int) ($preferenceSetting->has_request ?? 0),
                'is_enabled'       => (int) ($preferenceSetting->is_enabled ?? 0),
                'active_semesters' => [
                    [
                        'active_semester_id'    => $activeSemester->active_semester_id,
                        'academic_year_id'      => $activeSemester->academic_year_id,
                        'academic_year'         => $activeSemester->academicYear->year_start . '-' . $activeSemester->academicYear->year_end,
                        'semester_id'           => $activeSemester->semester_id,
                        'semester_label'        => $this->getSemesterLabel($activeSemester->semester_id),
                        'global_start_date'     => $preferenceSetting && $preferenceSetting->global_start_date
                        ? Carbon::parse($preferenceSetting->global_start_date)->toDateString() : null,
                        'individual_start_date' => $preferenceSetting && $preferenceSetting->individual_start_date
                        ? Carbon::parse($preferenceSetting->individual_start_date)->toDateString() : null,
                        'global_deadline'       => $preferenceSetting && $preferenceSetting->global_deadline
                        ? Carbon::parse($preferenceSetting->global_deadline)->toDateString() : null,
                        'individual_deadline'   => $preferenceSetting && $preferenceSetting->individual_deadline
                        ? Carbon::parse($preferenceSetting->individual_deadline)->toDateString() : null,
                        'courses'               => $courses->toArray(),
                    ],
                ],
            ];
        })
            ->sort(function ($a, $b) {
                if ($a['has_request'] !== $b['has_request']) {
                    return $b['has_request'] <=> $a['has_request'];
                }
                return strcmp($a['faculty_name'], $b['faculty_name']);
            })
            ->values();

        return response()->json([
            'preferences' => $facultyPreferences,
        ], 200, [], JSON_PRETTY_PRINT);
    }

    /**
     * Retrieves all faculty preferences for the active year and semester.
     * This returns ALL the instances of a selected course across all programs
     * in all active curricula.
     */
    public function getAllFacultyPreferences()
    {
        // ... Keep exactly as is ...
        $activeSemester = ActiveSemester::with(['academicYear', 'semester'])
            ->where('is_active', 1)
            ->first();

        if (! $activeSemester) {
            return response()->json(['error' => 'No active semester found'], 404);
        }

        $faculty = Faculty::with(['user', 'preferenceSetting'])
            ->leftJoin('preferences', function ($join) use ($activeSemester) {
                $join->on('faculty.id', '=', 'preferences.faculty_id')
                    ->where('preferences.active_semester_id', $activeSemester->active_semester_id);
            })
            ->leftJoin('course_assignments', 'preferences.course_assignment_id', '=', 'course_assignments.course_assignment_id')
            ->leftJoin('courses', 'course_assignments.course_id', '=', 'courses.course_id')
            ->select('faculty.*', 'preferences.*', 'course_assignments.*', 'courses.*')
            ->get();

        $temporaryOfferingIds = $faculty->pluck('temporary_course_offering_id')->filter()->unique()->values();
        $temporaryOfferingsById = collect();
        if ($temporaryOfferingIds->isNotEmpty()) {
            $temporaryOfferingsById = DB::table('temporary_course_offerings as tco')
                ->join('courses as co', 'tco.course_id', '=', 'co.course_id')
                ->join('programs as p', 'tco.program_id', '=', 'p.program_id')
                ->select(
                    'tco.*',
                    'co.course_code',
                    'co.course_title',
                    'co.lec_hours',
                    'co.lab_hours',
                    'co.units',
                    'p.program_code'
                )
                ->whereIn('tco.temporary_course_offering_id', $temporaryOfferingIds)
                ->get()
                ->keyBy('temporary_course_offering_id');
        }

        $facultyPreferences = $faculty->groupBy('id')->map(function ($facultyGroup) use ($activeSemester, $temporaryOfferingsById) {
            $faculty           = $facultyGroup->first();
            $facultyUser       = $faculty->user;
            $preferenceSetting = $faculty->preferenceSetting;

            $courses = $facultyGroup->flatMap(function ($preference) use ($activeSemester, $temporaryOfferingsById) {
                if ($preference->course_assignment_id) {
                    $preferenceDays = PreferenceDay::where('preference_id', $preference->preferences_id)
                        ->orderBy('preferred_day')
                        ->get()
                        ->map(function ($day) {
                            return [
                                'day'        => $day->preferred_day,
                                'start_time' => $day->preferred_start_time,
                                'end_time'   => $day->preferred_end_time,
                            ];
                        })->values()->toArray();

                    $submittedCourse = DB::table('course_assignments')
                        ->join('courses', 'course_assignments.course_id', '=', 'courses.course_id')
                        ->join('curricula_program', 'course_assignments.curricula_program_id', '=', 'curricula_program.curricula_program_id')
                        ->join('programs', 'curricula_program.program_id', '=', 'programs.program_id')
                        ->where('course_assignments.course_assignment_id', $preference->course_assignment_id)
                        ->select(
                            'courses.*',
                            'course_assignments.*',
                            'programs.program_id',
                            'programs.program_code'
                        )
                        ->first();

                    return ($submittedCourse && !$preference->is_ignored)
                        ? [[
                            'course_assignment_id' => $submittedCourse->course_assignment_id ?? 'N/A',
                            'temporary_course_offering_id' => null,
                            'course_details'       => [
                                'course_id'    => $submittedCourse->course_id ?? 'N/A',
                                'course_code'  => $submittedCourse->course_code ?? null,
                                'course_title' => $submittedCourse->course_title ?? null,
                                'program_id'   => $submittedCourse->program_id ?? null,
                                'program_code' => $submittedCourse->program_code ?? null,
                            ],
                            'lec_hours'      => is_numeric($submittedCourse->lec_hours) ? (int) $submittedCourse->lec_hours : 0,
                            'lab_hours'      => is_numeric($submittedCourse->lab_hours) ? (int) $submittedCourse->lab_hours : 0,
                            'units'          => $submittedCourse->units ?? 0,
                            'preferred_days' => $preferenceDays,
                            'preferences_id' => $preference->preferences_id,
                            'is_ignored'     => (bool) $preference->is_ignored,
                            'is_temporary'          => false,
                            'temporary_type'        => null,
                            'temporary_status'      => null,
                            'petition_required'     => false,
                            'created_at'     => $preference->created_at ? Carbon::parse($preference->created_at)->toDateTimeString() : 'N/A',
                            'updated_at'     => $preference->updated_at ? Carbon::parse($preference->updated_at)->toDateTimeString() : 'N/A',
                        ]]
                        : collect();
                }
                if ($preference->temporary_course_offering_id) {
                    $temporaryOffering = $temporaryOfferingsById->get($preference->temporary_course_offering_id);

                    if (! $temporaryOffering) {
                        return collect();
                    }

                    $preferenceDays = PreferenceDay::where('preference_id', $preference->preferences_id)
                        ->orderBy('preferred_day')
                        ->get()
                        ->map(function ($day) {
                            return [
                                'day'        => $day->preferred_day,
                                'start_time' => $day->preferred_start_time,
                                'end_time'   => $day->preferred_end_time,
                            ];
                        })->values()->toArray();

                    if ($preference->is_ignored) {
                        return collect();
                    }

                    return [[
                        'course_assignment_id' => null,
                        'temporary_course_offering_id' => $temporaryOffering->temporary_course_offering_id,
                        'course_details'       => [
                            'course_id'    => $temporaryOffering->course_id ?? 'N/A',
                            'course_code'  => $temporaryOffering->course_code ?? null,
                            'course_title' => $temporaryOffering->course_title ?? null,
                            'program_id'   => $temporaryOffering->program_id ?? null,
                            'program_code' => $temporaryOffering->program_code ?? null,
                        ],
                        'lec_hours'      => is_numeric($temporaryOffering->lec_hours) ? (int) $temporaryOffering->lec_hours : 0,
                        'lab_hours'      => is_numeric($temporaryOffering->lab_hours) ? (int) $temporaryOffering->lab_hours : 0,
                        'units'          => $temporaryOffering->units ?? 0,
                        'preferred_days' => $preferenceDays,
                        'preferences_id' => $preference->preferences_id,
                        'is_ignored'     => (bool) $preference->is_ignored,
                        'is_temporary'          => true,
                        'temporary_type'        => $temporaryOffering->type ?? null,
                        'temporary_status'      => $temporaryOffering->status ?? null,
                        'petition_required'     => in_array($temporaryOffering->type, ['petition', 'tutorial'], true),
                        'created_at'     => $preference->created_at ? Carbon::parse($preference->created_at)->toDateTimeString() : 'N/A',
                        'updated_at'     => $preference->updated_at ? Carbon::parse($preference->updated_at)->toDateTimeString() : 'N/A',
                    ]];
                }
                return collect();
            })->filter();

            return [
                'faculty_id'       => $faculty->id,
                'faculty_name'     => $facultyUser->formatted_name ?? 'N/A',
                'faculty_code'     => $facultyUser->code ?? 'N/A',
                'faculty_type'     => $faculty->facultyType->faculty_type ?? 'N/A',
                'faculty_units'    => $faculty->faculty_units,
                'has_request'      => (int) ($preferenceSetting->has_request ?? 0),
                'is_enabled'       => (int) ($preferenceSetting->is_enabled ?? 0),
                'active_semesters' => [
                    [
                        'active_semester_id'    => $activeSemester->active_semester_id,
                        'academic_year_id'      => $activeSemester->academic_year_id,
                        'academic_year'         => $activeSemester->academicYear->year_start . '-' . $activeSemester->academicYear->year_end,
                        'semester_id'           => $activeSemester->semester_id,
                        'semester_label'        => $this->getSemesterLabel($activeSemester->semester_id),
                        'global_start_date'     => $preferenceSetting && $preferenceSetting->global_start_date
                            ? Carbon::parse($preferenceSetting->global_start_date)->toDateString() : null,
                        'individual_start_date' => $preferenceSetting && $preferenceSetting->individual_start_date
                            ? Carbon::parse($preferenceSetting->individual_start_date)->toDateString() : null,
                        'global_deadline'       => $preferenceSetting && $preferenceSetting->global_deadline 
                            ? Carbon::parse($preferenceSetting->global_deadline)->toDateString() : null,
                        'individual_deadline'   => $preferenceSetting && $preferenceSetting->individual_deadline
                            ? Carbon::parse($preferenceSetting->individual_deadline)->toDateString()
                            : ($preferenceSetting && $preferenceSetting->global_deadline 
                            ? Carbon::parse($preferenceSetting->global_deadline)->toDateString(): null),
                        'courses'               => $courses->values()->toArray(),
                    ],
                ],
            ];
        })
            ->sortByDesc('has_request')
            ->sortBy('faculty_name')
            ->values();

        return response()->json([
            'preferences' => $facultyPreferences,
        ], 200, [], JSON_PRETTY_PRINT);
    }

    /**
     * Retrieves preferences for a specific faculty based on their faculty_id.
     */
    public function getFacultyPreferencesById($faculty_id)
    {
        $activeSemester = ActiveSemester::with(['academicYear', 'semester'])
            ->where('is_active', 1)
            ->first();

        if (! $activeSemester) {
            return response()->json(['error' => 'No active semester found'], 404);
        }

        $faculty = Faculty::where('id', $faculty_id)
            ->with([
                'user',
                'preferenceSetting',
                'preferences' => function ($query) use ($activeSemester) {
                    $query->where('active_semester_id', $activeSemester->active_semester_id)
                        ->with([
                            'courseAssignment.course',
                            'temporaryCourseOffering.course',
                            'temporaryCourseOffering.program',
                            'preferenceDays',
                            'section'
                        ]);
                },
            ])
            ->first();

        if (! $faculty) {
            return response()->json(['error' => 'Faculty not found'], 404);
        }

        $preferenceSetting = $faculty->preferenceSetting;

        $isSchedulesPublished = DB::table('faculty_schedule_publication')
            ->where('faculty_id', $faculty_id)
            ->where('academic_year_id', $activeSemester->academic_year_id)
            ->where('semester_id', $activeSemester->semester_id)
            ->value('is_published') ?? 0;

        $courseAssignmentIds = $faculty->preferences->pluck('course_assignment_id')->filter()->unique()->toArray();
        $sectionsPerProgramYearIds = $faculty->preferences->pluck('sections_per_program_year_id')->filter()->unique()->toArray();
        $programDetailsByCourseAssignment = collect();
        if (!empty($courseAssignmentIds)) {
            $programDetailsByCourseAssignment = DB::table('course_assignments')
                ->join('curricula_program', 'course_assignments.curricula_program_id', '=', 'curricula_program.curricula_program_id')
                ->join('programs', 'curricula_program.program_id', '=', 'programs.program_id')
                ->join('sections_per_program_year', 'sections_per_program_year.program_id', '=', 'programs.program_id')
                ->whereIn('sections_per_program_year.sections_per_program_year_id', $sectionsPerProgramYearIds)
                ->whereIn('course_assignments.course_assignment_id', $courseAssignmentIds)
                ->select('course_assignments.course_assignment_id','programs.program_id', 'programs.program_code', 'programs.program_title')
                ->get()
                ->keyBy('course_assignment_id');
        }

        $courses = $faculty->preferences->map(function ($preference) use ($programDetailsByCourseAssignment) {
            $preferenceDays = $preference->preferenceDays->map(function ($day) {
                return [
                    'day'        => $day->preferred_day,
                    'start_time' => $day->preferred_start_time,
                    'end_time'   => $day->preferred_end_time,
                ];
            })->sortBy('day')->values()->toArray();

            if ($preference->temporary_course_offering_id && $preference->temporaryCourseOffering) {
                $temporaryOffering = $preference->temporaryCourseOffering;
                $program = $temporaryOffering->program;

                return [
                    'course_assignment_id' => null,
                    'temporary_course_offering_id' => $temporaryOffering->temporary_course_offering_id,
                    'course_details'       => [
                        'course_id'    => $temporaryOffering->course?->course_id ?? 'N/A',
                        'course_code'  => $temporaryOffering->course?->course_code ?? null,
                        'course_title' => $temporaryOffering->course?->course_title ?? null,
                        'year_level'   => $preference->section?->year_level ?? $temporaryOffering->year_level ?? null,
                    ],
                    'section_details'     => [
                        'section_id'   => $preference->sections_per_program_year_id ?? null,
                        'section_name' => $preference->section?->section_name ?? null
                    ],
                    'program_details'      => [
                        'program_id'    => $program?->program_id ?? null,
                        'program_code'  => $program?->program_code ?? null,
                        'program_title' => $program?->program_title ?? null,
                        'year_levels'   => [],
                    ],
                    'lec_hours'            => is_numeric($temporaryOffering->course?->lec_hours) ? (int) $temporaryOffering->course->lec_hours : 0,
                    'lab_hours'            => is_numeric($temporaryOffering->course?->lab_hours) ? (int) $temporaryOffering->course->lab_hours : 0,
                    'units'                => $temporaryOffering->course?->units ?? 0,
                    'preferred_days'       => $preferenceDays,
                    'preferences_id'       => $preference->preferences_id,
                    'is_ignored'           => (bool) $preference->is_ignored,
                    'is_temporary'          => true,
                    'temporary_type'        => $temporaryOffering->type ?? null,
                    'temporary_status'      => $temporaryOffering->status ?? null,
                    'petition_required'     => in_array($temporaryOffering->type, ['petition', 'tutorial'], true),
                    'created_at'           => $preference->created_at ? Carbon::parse($preference->created_at)->toDateTimeString() : 'N/A',
                    'updated_at'           => $preference->updated_at ? Carbon::parse($preference->updated_at)->toDateTimeString() : 'N/A',
                ];
            }

            $program = $programDetailsByCourseAssignment->get($preference->course_assignment_id);

            return [
                'course_assignment_id' => $preference->course_assignment_id ?? 'N/A',
                'temporary_course_offering_id' => null,
                'course_details'       => [
                    'course_id'    => $preference->courseAssignment->course->course_id ?? 'N/A',
                    'course_code'  => $preference->courseAssignment->course->course_code ?? null,
                    'course_title' => $preference->courseAssignment->course->course_title ?? null,
                    'year_level'   => $preference->section?->year_level  ?? null,                    
                ],
                'section_details'     => [
                    'section_id'   => $preference->sections_per_program_year_id ?? null,
                    'section_name' => $preference->section?->section_name ?? null
                ],
                'program_details'      => [
                    'program_id'    => $program->program_id ?? null,
                    'program_code'  => $program->program_code ?? null,
                    'program_title' => $program->program_title ?? null,
                    'year_levels'   => [],
                ],
                'lec_hours'            => is_numeric($preference->courseAssignment->course->lec_hours) ? (int) $preference->courseAssignment->course->lec_hours : 0,
                'lab_hours'            => is_numeric($preference->courseAssignment->course->lab_hours) ? (int) $preference->courseAssignment->course->lab_hours : 0,
                'units'                => $preference->courseAssignment->course->units ?? 0,
                'preferred_days'       => $preferenceDays,
                'preferences_id'       => $preference->preferences_id,
                'is_ignored'           => (bool) $preference->is_ignored,
                'is_temporary'          => false,
                'temporary_type'        => null,
                'temporary_status'      => null,
                'petition_required'     => false,
                'created_at'           => $preference->created_at ? Carbon::parse($preference->created_at)->toDateTimeString() : 'N/A',
                'updated_at'           => $preference->updated_at ? Carbon::parse($preference->updated_at)->toDateTimeString() : 'N/A',
            ];
            }
        );

        $facultyPreference = [
            'faculty_id'             => $faculty->id,
            'faculty_name'           => $faculty->user->formatted_name ?? 'N/A',
            'faculty_code'           => $faculty->user->code ?? 'N/A',
            'faculty_type'           => $faculty->facultyType->faculty_type ?? 'N/A',
            'faculty_units'          => $faculty->faculty_units,
            'has_request'            => (int) ($preferenceSetting->has_request ?? 0),
            'is_enabled'             => (int) ($preferenceSetting->is_enabled ?? 0),
            'is_schedules_published' => (int) $isSchedulesPublished,
            'active_semesters'       => [
                [
                    'active_semester_id'  => $activeSemester->active_semester_id,
                    'academic_year_id'    => $activeSemester->academic_year_id,
                    'academic_year'       => $activeSemester->academicYear->year_start . '-' . $activeSemester->academicYear->year_end,
                    'semester_id'         => $activeSemester->semester_id,
                    'semester_label'      => $this->getSemesterLabel($activeSemester->semester_id),
                    'global_deadline'     => $preferenceSetting && $preferenceSetting->global_deadline ? Carbon::parse($preferenceSetting->global_deadline)->toDateString() : null,
                    'individual_deadline' => $preferenceSetting && $preferenceSetting->individual_deadline ? Carbon::parse($preferenceSetting->individual_deadline)->toDateString() : null,
                    'courses'             => $courses->toArray(),
                ],
            ],
        ];

        return response()->json([
            'preferences' => $facultyPreference,
        ], 200, [], JSON_PRETTY_PRINT);
    }

    /*
    * Retrieves faculty preference history across all academic years and semesters.
    **/
    public function getPreferencesHistoryByFacultyId($faculty_id)
    {
        // ... Keep exactly as is ...
        $faculty = Faculty::find($faculty_id);
        if (! $faculty) {
            return response()->json(['error' => 'Faculty not found'], 404);
        }

        $preferences = Preference::with([
                'preferenceDays',
                'courseAssignment.course',
                'temporaryCourseOffering.course',
                'temporaryCourseOffering.program',
                'section'
            ])
            ->where('faculty_id', $faculty_id)
            ->get();

        if ($preferences->isEmpty()) {
            return response()->json([
                'academic_years' => [],
            ], 200, [], JSON_PRETTY_PRINT);
        }

        $activeSemesterMap = ActiveSemester::with(['academicYear', 'semester'])
            ->get()
            ->keyBy('active_semester_id');

        $academicYears = AcademicYear::join('active_semesters', 'academic_years.academic_year_id', '=', 'active_semesters.academic_year_id')
            ->join('semesters', 'active_semesters.semester_id', '=', 'semesters.semester_id')
            ->select(
                'academic_years.academic_year_id',
                \DB::raw("CONCAT(academic_years.year_start, '-', academic_years.year_end) as academic_year"),
                'semesters.semester_id',
                'semesters.semester as semester_number',
                'active_semesters.active_semester_id',
                'active_semesters.start_date',
                'active_semesters.end_date'
            )
            ->orderBy('academic_years.year_start', 'desc')
            ->orderBy('semesters.semester')
            ->get();

        $aySemIndex = [];
        foreach ($academicYears as $as) {
            if ($as->academic_year_id && $as->semester_id) {
                $aySemIndex[$as->academic_year_id][$as->semester_id] = $as;
            }
        }

        $grouped = [];

        foreach ($preferences as $pref) {
            $as = $activeSemesterMap->get($pref->active_semester_id);
            if (! $as || ! $as->academicYear) {
                continue;
            }

            $academicYearId    = $as->academic_year_id;
            $academicYearLabel = $as->academicYear->year_start . '-' . $as->academicYear->year_end;
            $academicYearStart = (int) $as->academicYear->year_start;
            $semesterId        = (int) $as->semester_id;

            if (! isset($grouped[$academicYearId])) {
                $grouped[$academicYearId] = [
                    'academic_year_id' => $academicYearId,
                    'academic_year'    => $academicYearLabel,
                    'year_start'       => $academicYearStart,
                    'semesters'        => [
                        1 => [
                            'semester_id'        => 1,
                            'semester_label'     => $this->getSemesterLabel(1),
                            'active_semester_id' => $aySemIndex[$academicYearId][1]->active_semester_id ?? null,
                            'preferences'        => [],
                        ],
                        2 => [
                            'semester_id'        => 2,
                            'semester_label'     => $this->getSemesterLabel(2),
                            'active_semester_id' => $aySemIndex[$academicYearId][2]->active_semester_id ?? null,
                            'preferences'        => [],
                        ],
                        3 => [
                            'semester_id'        => 3,
                            'semester_label'     => $this->getSemesterLabel(3),
                            'active_semester_id' => $aySemIndex[$academicYearId][3]->active_semester_id ?? null,
                            'preferences'        => [],
                        ],
                    ],
                ];
            }

            $preferenceDays = $pref->preferenceDays
                ->map(fn($day) => [
                    'day'        => $day->preferred_day,
                    'start_time' => $day->preferred_start_time,
                    'end_time'   => $day->preferred_end_time,
                ])
                ->sortBy('day')
                ->values()
                ->toArray();

            $isTemporary = ! empty($pref->temporary_course_offering_id);
            $temporaryOffering = $isTemporary ? $pref->temporaryCourseOffering : null;
            $course = $isTemporary
                ? $temporaryOffering?->course
                : ($pref->courseAssignment->course ?? null);

            $program = null;
            if ($isTemporary) {
                $program = $temporaryOffering?->program;
            } else if (! empty($pref->course_assignment_id)) {
                $program = DB::table('course_assignments')
                    ->join('curricula_program', 'course_assignments.curricula_program_id', '=', 'curricula_program.curricula_program_id')
                    ->join('programs', 'curricula_program.program_id', '=', 'programs.program_id')
                    ->where('course_assignments.course_assignment_id', $pref->course_assignment_id)
                    ->select('programs.program_id', 'programs.program_code')
                    ->first();
            }

            $section = null;
            if (! empty($pref->sections_per_program_year_id)) {
                $section = DB::table('sections_per_program_year')
                    ->where('sections_per_program_year_id', $pref->sections_per_program_year_id)
                    ->select('sections_per_program_year_id', 'section_name', 'year_level')
                    ->first();
            }

            $preferencePayload = [
                'course_assignment_id' => $isTemporary ? null : ($pref->course_assignment_id ?? 'N/A'),
                'temporary_course_offering_id' => $isTemporary ? $pref->temporary_course_offering_id : null,
                'course_details'       => [
                    'course_id'    => $course->course_id ?? 'N/A',
                    'course_code'  => $course->course_code ?? null,
                    'course_title' => $course->course_title ?? null,
                    'program_id'   => $program->program_id ?? null,
                    'program_code' => $program->program_code ?? null,
                    'year_level'   => $section->year_level ?? null,
                ],
                'section_details'     => [
                    'section_id'   => $section->sections_per_program_year_id ?? null,
                    'section_name' => $section->section_name ?? null,
                ],
                'lec_hours'      => $course && is_numeric($course->lec_hours) ? (int) $course->lec_hours : 0,
                'lab_hours'      => $course && is_numeric($course->lab_hours) ? (int) $course->lab_hours : 0,
                'units'          => $course->units ?? 0,
                'preferred_days' => $preferenceDays,
                'is_temporary'          => $isTemporary,
                'temporary_type'        => $temporaryOffering?->type ?? null,
                'temporary_status'      => $temporaryOffering?->status ?? null,
                'petition_required'     => $temporaryOffering ? in_array($temporaryOffering->type, ['petition', 'tutorial'], true) : false,
                'created_at'     => $pref->created_at ? Carbon::parse($pref->created_at)->toDateTimeString() : 'N/A',
                'updated_at'     => $pref->updated_at ? Carbon::parse($pref->updated_at)->toDateTimeString() : 'N/A',
            ];

            if (isset($grouped[$academicYearId]['semesters'][$semesterId])) {
                $grouped[$academicYearId]['semesters'][$semesterId]['preferences'][] = $preferencePayload;
            }
        }

        $result = collect($grouped)
            ->sortByDesc('year_start')
            ->map(function ($year) {
                $semesters = collect($year['semesters'])
                    ->sortBy('semester_id')
                    ->values()
                    ->toArray();
                return [
                    'academic_year_id' => $year['academic_year_id'],
                    'academic_year'    => $year['academic_year'],
                    'semesters'        => $semesters,
                ];
            })
            ->values()
            ->toArray();

        return response()->json([
            'academic_years' => $result
        ], 200, [], JSON_PRETTY_PRINT);
    }

    /**
     * Deletes a specific faculty preference.
     */
    public function deletePreferences(Request $request, $preference_id)
    {
        $facultyId        = $request->query('faculty_id');
        $activeSemesterId = $request->query('active_semester_id');
        $sectionsPerProgramYearId = $request->query('sections_per_program_year_id');
        $temporaryCourseOfferingId = $request->query('temporary_course_offering_id');

        if (! $facultyId) {
            return response()->json(['message' => 'Faculty ID is required.'], 400);
        }

        if (! $activeSemesterId) {
            return response()->json(['message' => 'Active semester ID is required.'], 400);
        }

        // Check deadline
        $preferenceSetting = PreferencesSetting::where('faculty_id', $facultyId)->first();
        $deadline          = $preferenceSetting->individual_deadline ?? $preferenceSetting->global_deadline;

        if ($preferenceSetting->is_enabled == 0 || ($deadline && Carbon::now()->greaterThan(Carbon::parse($deadline)->endOfDay()))) {
            return response()->json([
                'message' => 'The submission deadline has passed. You cannot delete preferences.',
            ], 403);
        }

        // Find and delete the specific preference along with its associated days.
        // When sections_per_program_year_id is falsy (0 or absent), the stored
        // record has NULL in that column, so we must use whereNull to match it.
        $preferenceQuery = Preference::where('faculty_id', $facultyId)
            ->where('active_semester_id', $activeSemesterId)
            ->where(function ($query) use ($sectionsPerProgramYearId) {
                if (!$sectionsPerProgramYearId || $sectionsPerProgramYearId == 0) {
                    $query->whereNull('sections_per_program_year_id');
                } else {
                    $query->where(
                        'sections_per_program_year_id',
                        $sectionsPerProgramYearId
                    );
                }
            })
            ->where(function ($query) use ($preference_id) {
                // Try matching by course_assignment_id first,
                // then by temporary_course_offering_id.
                $query->where('course_assignment_id', $preference_id)
                      ->orWhere('temporary_course_offering_id', $preference_id);
            });

        $preference = $preferenceQuery->first();

        if (! $preference) {
            return response()->json(['message' => 'Preference not found.'], 404);
        }

        // ═══════════════════════════════════════════════════════
        // SAVE DATA FOR AUDIT BEFORE DELETION
        // ═══════════════════════════════════════════════════════
        $originalData = $preference->toArray();
        $facultyUser = User::whereHas('faculty', function($q) use ($facultyId) {
            $q->where('id', $facultyId);
        })->first();
        $facultyName = $facultyUser ? $facultyUser->formatted_name : "Faculty ID: {$facultyId}";

        // Delete related preference days
        PreferenceDay::where('preference_id', $preference->preferences_id)->delete();

        // Delete the preference
        $preference->delete();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Preference Deleted
        // ═══════════════════════════════════════════════════════
        $courseReference = $temporaryCourseOfferingId
            ? "Temporary Offering ID: {$temporaryCourseOfferingId}"
            : "Course Assignment ID: {$preference_id}";

        AuditLogger::logDelete(
            model: 'Preference',
            modelId: $originalData['preferences_id'],
            data: $originalData,
            description: "Deleted a schedule preference for {$facultyName} ({$courseReference})"
        );

        return response()->json(['message' => 'Preference deleted successfully.'], 200);
    }

    /**
     * Deletes all preferences for a specific faculty and active semester.
     */
    public function deleteAllPreferences(Request $request)
    {
        $facultyId        = $request->query('faculty_id');
        $activeSemesterId = $request->query('active_semester_id');

        if (! $facultyId) {
            return response()->json(['message' => 'Faculty ID is required.'], 400);
        }

        if (! $activeSemesterId) {
            return response()->json(['message' => 'Active semester ID is required.'], 400);
        }

        // Check deadline
        $preferenceSetting = PreferencesSetting::where('faculty_id', $facultyId)->first();
        $deadline          = $preferenceSetting->individual_deadline ?? $preferenceSetting->global_deadline;

        if ($preferenceSetting->is_enabled == 0 || ($deadline && Carbon::now()->greaterThan(Carbon::parse($deadline)->endOfDay()))) {
            return response()->json([
                'message' => 'The submission deadline has passed. You cannot delete preferences.',
            ], 403);
        }

        // Find all preferences for the faculty in the active semester
        $preferences = Preference::where('faculty_id', $facultyId)
            ->where('active_semester_id', $activeSemesterId)
            ->get();

        if ($preferences->isEmpty()) {
            return response()->json(['message' => 'No preferences found for this faculty in the active semester.'], 404);
        }

        $deletedCount = $preferences->count();

        // Delete related preference days and then the preferences
        foreach ($preferences as $preference) {
            PreferenceDay::where('preference_id', $preference->preferences_id)->delete();
            $preference->delete();
        }

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: ALL Preferences Deleted
        // ═══════════════════════════════════════════════════════
        $facultyUser = User::whereHas('faculty', function($q) use ($facultyId) {
            $q->where('id', $facultyId);
        })->first();
        $facultyName = $facultyUser ? $facultyUser->formatted_name : "Faculty ID: {$facultyId}";

        AuditLogger::logDelete(
            model: 'Preference',
            modelId: 0,
            data: ['faculty_id' => $facultyId, 'active_semester_id' => $activeSemesterId],
            description: "Cleared ALL schedule preferences ({$deletedCount} total) for {$facultyName} in Active Semester {$activeSemesterId}"
        );

        return response()->json(['message' => 'All preferences for this faculty in the active semester deleted successfully.'], 200);
    }

    /**
     * Toggles preference settings globally for all faculty members.
     */
    public function toggleAllPreferences(Request $request)
    {
        // Step 1: Validate the input
        $validated = $request->validate([
            'status'            => 'required|boolean',
            'global_deadline'   => 'nullable|date',
            'global_start_date' => 'nullable|date',
            'send_email'        => 'required|boolean',
        ]);

        $sendEmail = $validated['send_email'];

        DB::transaction(function () use ($validated, $sendEmail) {
            $status            = $validated['status'];
            $global_deadline   = $status && $validated['global_deadline'] ? Carbon::parse($validated['global_deadline'])->endOfDay() : null;
            $global_start_date = $status && $validated['global_start_date'] ? Carbon::parse($validated['global_start_date'])->startOfDay() : null;

            // Current date and start date
            $currentDate = Carbon::now();
            $startDate   = $global_start_date;

            // Determine final status
            $finalStatus = false;
            if ($status) {
                // Enable only if start date is today or already passed
                $finalStatus = $startDate ? $startDate->lessThanOrEqualTo($currentDate) : true;
            }

            PreferencesSetting::query()->update([
                'is_enabled'          => $finalStatus,
                'global_deadline'     => $global_deadline,
                'global_start_date'   => $global_start_date,
                'individual_deadline' => null,
                'has_request'         => 0,
                'updated_at'          => now(),
            ]);

            // Handle faculties without settings
            $facultyWithoutSettings = Faculty::whereDoesntHave('preferenceSetting')->get();
            foreach ($facultyWithoutSettings as $faculty) {
                PreferencesSetting::create([
                    'faculty_id'          => $faculty->id,
                    'is_enabled'          => $status,
                    'global_deadline'     => $global_deadline,
                    'global_start_date'   => $global_start_date,
                    'individual_deadline' => null,
                    'has_request'         => 0,
                ]);
            }

            // Dispatch email jobs if sendEmail is true
            if ($sendEmail) {
                $faculties = Faculty::all();
                foreach ($faculties as $faculty) {
                    if ($finalStatus) {
                        SendFacultyPreferenceEmailJob::dispatch($faculty->id);
                    } else if ($startDate) {
                        SendFacultyPreferenceEmailJob::dispatch($faculty->id)->delay($startDate);
                    }
                }
            }

            // Clear all faculty schedule publications for the active semester
            $activeSemester = ActiveSemester::where('is_active', 1)->first();
            if ($activeSemester) {
                DB::table('faculty_schedule_publication')
                    ->where('academic_year_id', $activeSemester->academic_year_id)
                    ->where('semester_id', $activeSemester->semester_id)
                    ->update([
                        'is_published' => 0,
                        'updated_at'   => now(),
                    ]);
            }
        });

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Global Settings Updated
        // ═══════════════════════════════════════════════════════
        $statusText = $validated['status'] ? 'Enabled' : 'Disabled';
        AuditLogger::logUpdate(
            model: 'PreferencesSetting',
            modelId: 0,
            oldData: [],
            newData: ['status' => $statusText, 'deadline' => $validated['global_deadline']],
            description: "Updated GLOBAL Preference Submission Status to: {$statusText} (Deadline: {$validated['global_deadline']})"
        );

        return response()->json([
            'message'             => 'All preferences settings updated successfully',
            'status'              => $validated['status'],
            'global_deadline'     => $validated['global_deadline'],
            'global_start_date'   => $validated['global_start_date'],
            'updated_preferences' => PreferencesSetting::all(),
        ], 200);
    }

    /**
     * Toggles preference settings for a single faculty member.
     */
    public function toggleSinglePreferences(Request $request)
    {
        // Step 1: Validate the input
        $validated = $request->validate([
            'faculty_id'            => 'required|integer|exists:faculty,id',
            'status'                => 'required|boolean',
            'individual_deadline'   => 'nullable|date',
            'individual_start_date' => 'nullable|date',
            'send_email'            => 'required|boolean',
        ]);

        $faculty_id            = $validated['faculty_id'];
        $status                = $validated['status'];
        $individual_deadline   = $status && $validated['individual_deadline'] ? Carbon::parse($validated['individual_deadline'])->endOfDay() : null;
        $individual_start_date = $status && $validated['individual_start_date'] ? Carbon::parse($validated['individual_start_date'])->startOfDay() : null;
        $sendEmail             = $validated['send_email'];

        $oldSettings = PreferencesSetting::where('faculty_id', $faculty_id)->first();
        $oldData = $oldSettings ? $oldSettings->toArray() : [];

        DB::transaction(function () use ($validated, $faculty_id, $status, $individual_deadline, $individual_start_date, $sendEmail) {
            // Current date and start date
            $currentDate = Carbon::now();
            $startDate   = $individual_start_date;

            // Determine final status
            $finalStatus = false;
            if ($status) {
                // Enable only if start date is today or already passed
                $finalStatus = $startDate ? $startDate->lessThanOrEqualTo($currentDate) : true;
            }

            $preferenceSetting = PreferencesSetting::firstOrCreate(
                ['faculty_id' => $faculty_id],
                [
                    'has_request'           => 0,
                    'is_enabled'            => 0,
                    'global_deadline'       => null,
                    'individual_deadline'   => null,
                    'global_start_date'     => null,
                    'individual_start_date' => null,
                ]
            );

            $preferenceSetting->update([
                'is_enabled'            => $finalStatus,
                'individual_deadline'   => $individual_deadline,
                'individual_start_date' => $individual_start_date,
                'global_deadline'       => null,
                'global_start_date'     => null,
                'has_request'           => 0,
            ]);

            // Dispatch email job if sendEmail is true
            if ($sendEmail) {
                $faculty = Faculty::find($faculty_id);
                if ($faculty) {
                    if ($finalStatus) {
                        SendFacultyPreferenceEmailJob::dispatch($faculty_id, true);
                    } else if ($startDate) {
                        SendFacultyPreferenceEmailJob::dispatch($faculty_id, true)->delay($startDate);
                    }
                }
            }

            // Clear schedule publications for the specific faculty in the active semester
            $activeSemester = ActiveSemester::where('is_active', 1)->first();
            if ($activeSemester) {
                DB::table('faculty_schedule_publication')
                    ->where('academic_year_id', $activeSemester->academic_year_id)
                    ->where('semester_id', $activeSemester->semester_id)
                    ->update([
                        'is_published' => 0,
                        'updated_at'   => now(),
                    ]);
            }
        });

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Individual Setting Updated
        // ═══════════════════════════════════════════════════════
        $facultyUser = User::whereHas('faculty', function($q) use ($faculty_id) {
            $q->where('id', $faculty_id);
        })->first();
        $facultyName = $facultyUser ? $facultyUser->formatted_name : "Faculty ID: {$faculty_id}";

        $statusText = $validated['status'] ? 'Enabled' : 'Disabled';
        $deadlineText = $validated['individual_deadline'] ?? 'None';
        
        AuditLogger::logUpdate(
            model: 'PreferencesSetting',
            modelId: $faculty_id,
            oldData: $oldData,
            newData: ['is_enabled' => $statusText, 'individual_deadline' => $deadlineText],
            description: "Updated INDIVIDUAL Submission Status for {$facultyName} to: {$statusText} (Deadline: {$deadlineText})"
        );

        return response()->json([
            'message'               => 'Preference setting updated successfully for faculty',
            'faculty_id'            => $validated['faculty_id'],
            'is_enabled'            => $validated['status'],
            'individual_deadline'   => $validated['individual_deadline'],
            'individual_start_date' => $validated['individual_start_date'],
            'updated_preference'    => PreferencesSetting::where('faculty_id', $validated['faculty_id'])->first(),
        ], 200);
    }

    /**
     * Handles a faculty requesting access by setting has_request to 1.
     */
    public function requestAccess(Request $request)
    {
        $validated = $request->validate([
            'faculty_id' => 'required|exists:faculty,id',
        ]);

        $facultyId         = $validated['faculty_id'];
        $preferenceSetting = PreferencesSetting::where('faculty_id', $facultyId)->first();

        if (! $preferenceSetting) {
            PreferencesSetting::create([
                'faculty_id'  => $facultyId,
                'has_request' => 1,
                'is_enabled'  => 0,
            ]);
        } else {
            $preferenceSetting->has_request = 1;
            $preferenceSetting->save();
        }

        $admins = User::where('role', 'admin')
            ->where('status', 'Active')
            ->get();

        foreach ($admins as $admin) {
            NotifyAdminOfPreferenceChangeJob::dispatch(
                Faculty::find($facultyId),
                $admin
            );
        }

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Request Access
        // ═══════════════════════════════════════════════════════
        $facultyUser = User::whereHas('faculty', function($q) use ($facultyId) {
            $q->where('id', $facultyId);
        })->first();
        $facultyName = $facultyUser ? $facultyUser->formatted_name : "Faculty ID: {$facultyId}";

        AuditLogger::logUpdate(
            model: 'PreferencesSetting',
            modelId: $facultyId,
            oldData: ['has_request' => 0],
            newData: ['has_request' => 1],
            description: "{$facultyName} requested system access to submit preferences."
        );

        return response()->json([
            'message'     => 'Access request submitted successfully.',
            'has_request' => 1,
        ], 200);
    }

    /**
     * Toggles the 'is_ignored' flag for a specific faculty preference.
     */
    public function toggleIgnorePreference(Request $request, $preference_id)
    {
        if (!$request->user() || !$request->user()
            ->hasPermission('edit_faculty_preferences')
        ) {
            return response()->json([
                'message' => 'Unauthorized. You do not have permission to toggle preference ignore status.',
            ], 403);
        }

        $preference = Preference::find($preference_id);

        if (! $preference) {
            return response()->json([
                'message' => 'Preference not found.',
            ], 404);
        }

        $oldStatus = $preference->is_ignored;
        $preference->is_ignored = ! $oldStatus;
        $preference->save();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Toggle Preference Ignore
        // ═══════════════════════════════════════════════════════
        $facultyId = $preference->faculty_id;
        $facultyUser = User::whereHas('faculty', function($q) use ($facultyId) {
            $q->where('id', $facultyId);
        })->first();
        $facultyName = $facultyUser ? $facultyUser->formatted_name : "Faculty ID: {$facultyId}";

        $courseReference = $preference->course_assignment_id
            ? "Course Assignment ID: {$preference->course_assignment_id}"
            : "Temporary Offering ID: {$preference->temporary_course_offering_id}";

        $action = $preference->is_ignored ? 'ignored' : 'restored';
        
        AuditLogger::logUpdate(
            model: 'Preference',
            modelId: $preference->preferences_id,
            oldData: ['is_ignored' => $oldStatus],
            newData: ['is_ignored' => $preference->is_ignored],
            description: "Admin {$action} schedule preference for {$facultyName} ({$courseReference})"
        );

        return response()->json([
            'message'    => "Preference successfully " . ($preference->is_ignored ? "ignored" : "restored") . ".",
            'is_ignored' => $preference->is_ignored,
        ], 200);
    }

    /**
     * Handles a faculty cancelling access request by setting has_request to 0.
     */
    public function cancelRequestAccess(Request $request)
    {
        $validated = $request->validate([
            'faculty_id' => 'required|exists:faculty,id',
        ]);

        $facultyId = $validated['faculty_id'];

        $preferenceSetting = PreferencesSetting::where('faculty_id', $facultyId)->first();

        if (! $preferenceSetting) {
            return response()->json([
                'message' => 'No access request found to cancel.',
            ], 404);
        }

        $preferenceSetting->has_request = 0;
        $preferenceSetting->save();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Cancel Access Request
        // ═══════════════════════════════════════════════════════
        $facultyUser = User::whereHas('faculty', function($q) use ($facultyId) {
            $q->where('id', $facultyId);
        })->first();
        $facultyName = $facultyUser ? $facultyUser->formatted_name : "Faculty ID: {$facultyId}";

        AuditLogger::logUpdate(
            model: 'PreferencesSetting',
            modelId: $facultyId,
            oldData: ['has_request' => 1],
            newData: ['has_request' => 0],
            description: "{$facultyName} cancelled their request for preference submission access."
        );

        return response()->json([
            'message'     => 'Access request cancelled successfully.',
            'has_request' => 0,
        ], 200);
    }

    /**
     * Gets a readable label for a semester based on its ID.
     */
    private function getSemesterLabel($semesterId)
    {
        switch ($semesterId) {
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
}