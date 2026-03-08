<?php

namespace App\Http\Controllers;

use App\Models\AcademicYear;
use App\Models\AcademicYearCurricula;
use App\Models\ActiveSemester;
use App\Models\Curriculum;
use App\Models\Program;
use App\Models\ProgramYearLevelCurricula;
use App\Models\SectionsPerProgramYear;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class AcademicYearController extends Controller
{
    // ================================
    // General Academic Year Operations
    // ================================

    public function getAcademicYears()
    {
        $academicYears = AcademicYear::join('active_semesters', 'academic_years.academic_year_id', '=', 'active_semesters.academic_year_id')
            ->join('semesters', 'active_semesters.semester_id', '=', 'semesters.semester_id')
            ->select(
                'academic_years.academic_year_id',
                \DB::raw("CONCAT(academic_years.year_start, '-', academic_years.year_end) as academic_year"),
                'semesters.semester_id',
                'semesters.semester as semester_number',
                'active_semesters.start_date',
                'active_semesters.end_date'
            )
            ->orderBy('academic_years.year_start', 'desc')
            ->orderBy('semesters.semester')
            ->get();

        $groupedAcademicYears = [];

        foreach ($academicYears as $year) {
            if (!isset($groupedAcademicYears[$year->academic_year_id])) {
                $groupedAcademicYears[$year->academic_year_id] = [
                    'academic_year_id' => $year->academic_year_id,
                    'academic_year' => $year->academic_year,
                    'semesters' => [],
                ];
            }

            $semesterLabel = '';
            if ($year->semester_number == 1) {
                $semesterLabel = '1st Semester';
            } elseif ($year->semester_number == 2) {
                $semesterLabel = '2nd Semester';
            } elseif ($year->semester_number == 3) {
                $semesterLabel = 'Summer Semester';
            }

            $groupedAcademicYears[$year->academic_year_id]['semesters'][] = [
                'semester_id' => $year->semester_id,
                'semester_number' => $semesterLabel,
                'start_date' => $year->start_date,
                'end_date' => $year->end_date,
            ];
        }

        $groupedAcademicYears = array_values($groupedAcademicYears);

        return response()->json($groupedAcademicYears);
    }

    public function addAcademicYear(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'year_start' => 'required|numeric|min:1900|max:2100',
            'year_end' => 'required|numeric|min:1900|max:2100',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Invalid year format. Years must be between 1900 and 2100.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $yearStart = $request->input('year_start');
        $yearEnd = $request->input('year_end');

        if ($yearEnd <= $yearStart) {
            return response()->json(['message' => 'End year must be greater than the start year.'], 422);
        }

        if ($yearEnd - $yearStart !== 1) {
            return response()->json(['message' => 'Invalid academic year range. The difference between start and end year must be exactly 1 year.'], 422);
        }

        $existingAcademicYear = AcademicYear::where('year_start', $yearStart)->where('year_end', $yearEnd)->first();

        if ($existingAcademicYear) {
            return response()->json(['message' => "Academic Year {$yearStart}-{$yearEnd} already exists."], 422);
        }

        DB::beginTransaction();

        try {
            $activePrograms = Program::where('status', 'active')->get();

            if ($activePrograms->isEmpty()) {
                throw new \Exception('Cannot add an academic year—no active programs are found.');
            }

            $academicYear = new AcademicYear();
            $academicYear->year_start = $yearStart;
            $academicYear->year_end = $yearEnd;
            $academicYear->is_active = 0;
            $academicYear->save();

            $newAcademicYearId = $academicYear->academic_year_id;

            $latestCurriculum = Curriculum::where('status', 'active')
                ->orderBy('curriculum_year', 'desc')
                ->first();

            if (!$latestCurriculum) {
                throw new \Exception('No active curriculum found.');
            }

            $latestCurriculumId = $latestCurriculum->curriculum_id;

            $academicYearCurricula = new AcademicYearCurricula();
            $academicYearCurricula->academic_year_id = $newAcademicYearId;
            $academicYearCurricula->curriculum_id = $latestCurriculumId;
            $academicYearCurricula->save();

            for ($semesterId = 1; $semesterId <= 3; $semesterId++) {
                $activeSemester = new ActiveSemester();
                $activeSemester->academic_year_id = $newAcademicYearId;
                $activeSemester->semester_id = $semesterId;
                $activeSemester->is_active = 0;
                $activeSemester->save();
            }

            foreach ($activePrograms as $program) {
                $numberOfYears = $program->number_of_years;
                for ($yearLevel = 1; $yearLevel <= $numberOfYears; $yearLevel++) {
                    $programYearLevelCurricula = new ProgramYearLevelCurricula();
                    $programYearLevelCurricula->academic_year_id = $newAcademicYearId;
                    $programYearLevelCurricula->program_id = $program->program_id;
                    $programYearLevelCurricula->year_level = $yearLevel;
                    $programYearLevelCurricula->curriculum_id = $latestCurriculumId;
                    $programYearLevelCurricula->save();
                }
            }

            foreach ($activePrograms as $program) {
                $numberOfYears = $program->number_of_years;
                for ($yearLevel = 1; $yearLevel <= $numberOfYears; $yearLevel++) {
                    $section = new SectionsPerProgramYear();
                    $section->academic_year_id = $newAcademicYearId;
                    $section->program_id = $program->program_id;
                    $section->year_level = $yearLevel;
                    $section->section_name = '1';
                    $section->save();
                }
            }

            DB::commit();

            // ═══════════════════════════════════════════════════════
            // AUDIT LOG: Academic Year Created
            // ═══════════════════════════════════════════════════════
            AuditLogger::logCreate(
                model: 'AcademicYear',
                modelId: $newAcademicYearId,
                data: ['year_start' => $yearStart, 'year_end' => $yearEnd, 'curriculum_id' => $latestCurriculumId],
                description: "Created new Academic Year: {$yearStart}-{$yearEnd} and initialized default structures."
            );

            return response()->json([
                'message' => 'Academic year added successfully with related data.',
                'academic_year_id' => $newAcademicYearId,
            ], 201);

        } catch (\Exception $e) {
            DB::rollback();
            return response()->json([
                'status' => 'error',
                'message' => 'An error occurred: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function updateAcademicYear(Request $request)
    {
        $request->validate([
            'academic_year_id' => 'required|integer',
        ]);

        $academicYearId = $request->input('academic_year_id');
        $academicYear = AcademicYear::find($academicYearId);

        if (!$academicYear) {
            return response()->json(['status' => 'error', 'message' => "Academic Year with ID {$academicYearId} not found."], 404);
        }

        // 1. GET OLD DATA FOR TRACKING
        $oldCurriculaRecord = AcademicYearCurricula::where('academic_year_id', $academicYearId)->first();
        $oldCurriculumId = $oldCurriculaRecord ? $oldCurriculaRecord->curriculum_id : null;

        DB::beginTransaction();

        try {
            $activePrograms = Program::where('status', 'active')->get();

            if ($activePrograms->isEmpty()) {
                throw new \Exception('Cannot update an academic year—no active programs are found.');
            }

            $latestCurriculum = Curriculum::where('status', 'active')
                ->orderBy('curriculum_year', 'desc')
                ->first();

            if (!$latestCurriculum) {
                throw new \Exception('No active curriculum found.');
            }

            $latestCurriculumId = $latestCurriculum->curriculum_id;

            // 2. CHECK IF THERE ARE ACTUAL CHANGES
            if ($oldCurriculumId == $latestCurriculumId) {
                DB::rollBack();
                return response()->json(['message' => 'No changes detected. Academic Year already uses the latest curriculum.'], 200);
            }

            $updatedRows = AcademicYearCurricula::where('academic_year_id', $academicYearId)
                ->update(['curriculum_id' => $latestCurriculumId]);

            if ($updatedRows === 0) {
                AcademicYearCurricula::create([
                    'academic_year_id' => $academicYearId,
                    'curriculum_id' => $latestCurriculumId,
                ]);
            }

            for ($semesterId = 1; $semesterId <= 3; $semesterId++) {
                ActiveSemester::firstOrCreate([
                    'academic_year_id' => $academicYearId,
                    'semester_id' => $semesterId,
                ], [
                    'is_active' => 0,
                ]);
            }

            foreach ($activePrograms as $program) {
                $numberOfYears = $program->number_of_years;
                for ($yearLevel = 1; $yearLevel <= $numberOfYears; $yearLevel++) {
                    ProgramYearLevelCurricula::updateOrCreate(
                        [
                            'academic_year_id' => $academicYearId,
                            'program_id' => $program->program_id,
                            'year_level' => $yearLevel,
                        ],
                        [
                            'curriculum_id' => $latestCurriculumId,
                        ]
                    );
                }
            }

            foreach ($activePrograms as $program) {
                $numberOfYears = $program->number_of_years;
                for ($yearLevel = 1; $yearLevel <= $numberOfYears; $yearLevel++) {
                    SectionsPerProgramYear::firstOrCreate([
                        'academic_year_id' => $academicYearId,
                        'program_id' => $program->program_id,
                        'year_level' => $yearLevel,
                        'section_name' => '1',
                    ]);
                }
            }

            DB::commit();

            // ═══════════════════════════════════════════════════════
            // AUDIT LOG: Academic Year Updated (Human Readable)
            // ═══════════════════════════════════════════════════════
            $oldCurriculumYear = $oldCurriculumId ? Curriculum::find($oldCurriculumId)->curriculum_year : 'None';
            
            $changes = ["Curriculum: {$oldCurriculumYear} → {$latestCurriculum->curriculum_year}"];
            AuditLogger::logUpdate(
                model: 'AcademicYear',
                modelId: $academicYearId,
                oldData: ['curriculum_id' => $oldCurriculumId],
                newData: ['curriculum_id' => $latestCurriculumId],
                description: "Updated Academic Year {$academicYear->year_start}-{$academicYear->year_end} - " . implode(', ', $changes)
            );

            return response()->json([
                'status' => 'success',
                'message' => "Academic Year ID: {$academicYearId} updated successfully with the latest curriculum.",
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => 'An error occurred: Academic Year could not be updated'], 500);
        }
    }

    public function deleteAcademicYear(Request $request)
    {
        $request->validate([
            'academic_year_id' => 'required|integer',
        ]);

        $academicYearId = $request->input('academic_year_id');

        try {
            $hasSchedules = DB::table('schedules')
                ->join('section_courses', 'schedules.section_course_id', '=', 'section_courses.section_course_id')
                ->join('sections_per_program_year', 'section_courses.sections_per_program_year_id', '=', 'sections_per_program_year.sections_per_program_year_id')
                ->where('sections_per_program_year.academic_year_id', $academicYearId)
                ->where(function ($query) {
                    $query->whereNotNull('schedules.day')
                        ->orWhereNotNull('schedules.start_time')
                        ->orWhereNotNull('schedules.end_time')
                        ->orWhereNotNull('schedules.faculty_id')
                        ->orWhereNotNull('schedules.room_id');
                })
                ->exists();

            $academicYear = AcademicYear::find($academicYearId);
            $yearRange = $academicYear ? "{$academicYear->year_start}-{$academicYear->year_end}" : 'Unknown';

            if ($hasSchedules) {
                return response()->json([
                    'status' => 'error',
                    'message' => "Cannot delete A.Y. {$yearRange} as it has assigned schedules.",
                ], 422);
            }

            DB::beginTransaction();

            ProgramYearLevelCurricula::where('academic_year_id', $academicYearId)->delete();
            SectionsPerProgramYear::where('academic_year_id', $academicYearId)->delete();
            ActiveSemester::where('academic_year_id', $academicYearId)->delete();
            AcademicYearCurricula::where('academic_year_id', $academicYearId)->delete();
            AcademicYear::where('academic_year_id', $academicYearId)->delete();

            DB::commit();

            // ═══════════════════════════════════════════════════════
            // AUDIT LOG: Academic Year Deleted
            // ═══════════════════════════════════════════════════════
            AuditLogger::logDelete(
                model: 'AcademicYear',
                modelId: $academicYearId,
                data: ['year_range' => $yearRange],
                description: "Deleted Academic Year: {$yearRange} and all its dependencies."
            );

            return response()->json([
                'status' => 'success',
                'message' => 'Academic year and all related data were removed successfully.',
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => 'An error occurred: ' . $e->getMessage()], 500);
        }
    }

    // ===============================
    // Active Academic Year Operations
    // ===============================

    public function getActiveAcademicYearAndSemester()
    {
        $activeSemester = DB::table('active_semesters')
            ->join('academic_years', 'active_semesters.academic_year_id', '=', 'academic_years.academic_year_id')
            ->join('semesters', 'active_semesters.semester_id', '=', 'semesters.semester_id')
            ->where('active_semesters.is_active', 1)
            ->select(
                DB::raw("CONCAT(academic_years.year_start, '-', academic_years.year_end) as academic_year"),
                'semesters.semester as semester_number',
                'active_semesters.start_date',
                'active_semesters.end_date'
            )
            ->first();

        if ($activeSemester) {
            return response()->json([
                'activeYear' => $activeSemester->academic_year,
                'activeSemester' => $activeSemester->semester_number,
                'startDate' => $activeSemester->start_date,
                'endDate' => $activeSemester->end_date,
            ]);
        }

        return response()->json(['message' => 'No active academic year and semester found'], 404);
    }

    public function setActiveAcademicYearAndSemester(Request $request)
    {
        $academicYearId = $request->input('academic_year_id');
        $semesterId = $request->input('semester_id');
        $startDate = $request->input('start_date');
        $endDate = $request->input('end_date');

        $request->validate([
            'academic_year_id' => 'required|integer|exists:academic_years,academic_year_id',
            'semester_id' => 'required|integer|exists:semesters,semester_id',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
        ]);

        // 1. GET OLD DATA FOR TRACKING
        $currentlyActive = ActiveSemester::with('academicYear')->where('is_active', 1)->first();
        $oldActiveString = $currentlyActive ? "A.Y. {$currentlyActive->academicYear->year_start}-{$currentlyActive->academicYear->year_end} Term {$currentlyActive->semester_id}" : "None";

        DB::beginTransaction();

        try {
            $newAyModel = AcademicYear::find($academicYearId);
            $newActiveString = $newAyModel ? "A.Y. {$newAyModel->year_start}-{$newAyModel->year_end} Term {$semesterId}" : "ID:{$academicYearId} Term {$semesterId}";

            // 2. CHECK IF CHANGED
            if ($oldActiveString === $newActiveString) {
                DB::rollBack();
                return response()->json(['message' => 'No changes detected. That semester is already active.'], 200);
            }

            ActiveSemester::query()->update(['is_active' => 0]);
            DB::table('academic_years')->update(['is_active' => 0]);

            DB::table('preferences_settings')->update([
                'is_enabled' => 0,
                'global_deadline' => null,
                'individual_deadline' => null,
                'global_start_date' => null,
                'individual_start_date' => null,
            ]);

            ActiveSemester::where('academic_year_id', $academicYearId)
                ->where('semester_id', $semesterId)
                ->update([
                    'is_active' => 1,
                    'start_date' => $startDate,
                    'end_date' => $endDate,
                ]);

            DB::table('academic_years')
                ->where('academic_year_id', $academicYearId)
                ->update(['is_active' => 1]);

            DB::commit();

            // ═══════════════════════════════════════════════════════
            // AUDIT LOG: Active Semester Set
            // ═══════════════════════════════════════════════════════
            $changes = ["Active Term: {$oldActiveString} → {$newActiveString}"];
            
            AuditLogger::logUpdate(
                model: 'ActiveSemester',
                modelId: $academicYearId,
                oldData: ['active_term' => $oldActiveString],
                newData: ['active_term' => $newActiveString],
                description: "System State Changed - " . implode(', ', $changes)
            );

            return response()->json([
                'message' => 'Active academic year and semester updated successfully',
                'academic_year_id' => $academicYearId,
                'semester_id' => $semesterId,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to update active academic year and semester', 'error' => $e->getMessage()], 500);
        }
    }

    public function getProgramDetailsByAcademicYear(Request $request)
    {
        $request->validate([
            'academic_year_id' => 'required|integer',
        ]);

        $academicYearId = $request->input('academic_year_id');

        try {
            $programs = Program::select('programs.program_id', 'programs.program_code', 'programs.program_title')
                ->distinct()
                ->join('program_year_level_curricula as pylc', 'programs.program_id', '=', 'pylc.program_id')
                ->where('pylc.academic_year_id', $academicYearId)
                ->get();

            foreach ($programs as $program) {
                $yearLevels = ProgramYearLevelCurricula::select(
                    'program_year_level_curricula.year_level',
                    'program_year_level_curricula.curriculum_id',
                    'curricula.curriculum_year'
                )
                    ->join('curricula', 'program_year_level_curricula.curriculum_id', '=', 'curricula.curriculum_id')
                    ->where('program_year_level_curricula.academic_year_id', $academicYearId)
                    ->where('program_year_level_curricula.program_id', $program->program_id)
                    ->get();

                foreach ($yearLevels as $yearLevel) {
                    $sectionsCount = SectionsPerProgramYear::where('academic_year_id', $academicYearId)
                        ->where('program_id', $program->program_id)
                        ->where('year_level', $yearLevel->year_level)
                        ->count();

                    $yearLevel->number_of_sections = $sectionsCount;
                }

                $program->year_levels = $yearLevels;
            }

            return response()->json([
                'message' => 'Programs with year levels and sections fetched successfully.',
                'academic_year_id' => $academicYearId,
                'programs' => $programs,
            ], 200);

        } catch (\Exception $e) {
            return response()->json(['message' => 'An error occurred: ' . $e->getMessage()], 500);
        }
    }

    public function getActiveYearLevelsCurricula()
    {
        $activeYearLevels = \DB::table('program_year_level_curricula as pylc')
            ->select(
                'p.program_id',
                'p.program_code',
                'p.program_title',
                'pylc.year_level',
                'c.curriculum_id',
                'c.curriculum_year',
                'ay.year_start',
                'ay.year_end',
                's.semester',
                'sp.section_name',
                'sp.sections_per_program_year_id as section_id'
            )
            ->join('programs as p', 'pylc.program_id', '=', 'p.program_id')
            ->join('curricula as c', 'pylc.curriculum_id', '=', 'c.curriculum_id')
            ->join('academic_years as ay', 'pylc.academic_year_id', '=', 'ay.academic_year_id')
            ->join('active_semesters as ase', 'ay.academic_year_id', '=', 'ase.academic_year_id')
            ->join('semesters as s', 'ase.semester_id', '=', 's.semester_id')
            ->join('sections_per_program_year as sp', function ($join) {
                $join->on('pylc.program_id', '=', 'sp.program_id')
                    ->on('pylc.year_level', '=', 'sp.year_level')
                    ->on('pylc.academic_year_id', '=', 'sp.academic_year_id');
            })
            ->where('ase.is_active', 1)
            ->orderBy('p.program_id')
            ->orderBy('pylc.year_level')
            ->get();

        $response = [];

        foreach ($activeYearLevels as $row) {
            $programIndex = array_search($row->program_id, array_column($response, 'program_id'));

            if ($programIndex === false) {
                $response[] = [
                    'program_id' => $row->program_id,
                    'program_code' => $row->program_code,
                    'program_title' => $row->program_title,
                    'year_level_count' => 0,
                    'year_levels' => [],
                ];
                $programIndex = count($response) - 1;
            }

            $yearLevelIndex = array_search($row->year_level, array_column($response[$programIndex]['year_levels'], 'year_level'));

            if ($yearLevelIndex === false) {
                $response[$programIndex]['year_levels'][] = [
                    'year_level' => $row->year_level,
                    'curriculum_id' => $row->curriculum_id,
                    'curriculum_year' => $row->curriculum_year,
                    'sections' => [],
                ];
                $yearLevelIndex = count($response[$programIndex]['year_levels']) - 1;
                $response[$programIndex]['year_level_count']++;
            }

            $response[$programIndex]['year_levels'][$yearLevelIndex]['sections'][] = [
                'section_id' => $row->section_id,
                'section_name' => $row->section_name,
            ];
        }

        return response()->json($response);
    }

    public function updateYearLevelCurricula(Request $request)
    {
        $request->validate([
            'academic_year_id' => 'required|integer',
            'program_id' => 'required|integer',
            'year_levels' => 'required|array',
            'year_levels.*.year_level' => 'required|integer',
            'year_levels.*.curriculum_id' => 'required|integer',
        ]);

        $academicYearId = $request->input('academic_year_id');
        $programId = $request->input('program_id');
        $yearLevels = $request->input('year_levels');

        $changes = [];
        $programCode = Program::find($programId)->program_code ?? 'Unknown';
        
        // Create a map of ID => Year to make logs human-readable (e.g., ID 1 => "2022")
        $curriculaMap = Curriculum::pluck('curriculum_year', 'curriculum_id')->toArray();

        DB::beginTransaction();
        try {
            foreach ($yearLevels as $yearLevelData) {
                $yearLevel = $yearLevelData['year_level'];
                $curriculumId = $yearLevelData['curriculum_id'];

                $programYearLevel = ProgramYearLevelCurricula::where('academic_year_id', $academicYearId)
                    ->where('program_id', $programId)
                    ->where('year_level', $yearLevel)
                    ->first();

                $oldCurriculumId = $programYearLevel ? $programYearLevel->curriculum_id : null;

                if ($oldCurriculumId != $curriculumId) {
                    $oldYear = $oldCurriculumId && isset($curriculaMap[$oldCurriculumId]) ? $curriculaMap[$oldCurriculumId] : 'None';
                    $newYear = isset($curriculaMap[$curriculumId]) ? $curriculaMap[$curriculumId] : $curriculumId;
                    
                    $changes[] = "Year {$yearLevel} Curriculum: {$oldYear} → {$newYear}";
                }

                if ($programYearLevel) {
                    $programYearLevel->curriculum_id = $curriculumId;
                    $programYearLevel->save();
                } else {
                    ProgramYearLevelCurricula::create([
                        'academic_year_id' => $academicYearId,
                        'program_id' => $programId,
                        'year_level' => $yearLevel,
                        'curriculum_id' => $curriculumId,
                    ]);
                }
            }

            if (empty($changes)) {
                DB::rollBack();
                return response()->json(['message' => 'No changes detected'], 200);
            }

            DB::commit();

            // ═══════════════════════════════════════════════════════
            // AUDIT LOG: Curriculum Update per Year Level
            // ═══════════════════════════════════════════════════════
            AuditLogger::logUpdate(
                model: 'ProgramYearLevelCurricula',
                modelId: $programId,
                oldData: [],
                newData: ['updated_year_levels' => count($yearLevels)],
                description: "Updated {$programCode} Curricula - " . implode(', ', $changes)
            );

            return response()->json(['message' => 'Year levels updated successfully'], 200);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'An error occurred: ' . $e->getMessage()], 500);
        }
    }

    public function updateSections(Request $request)
    {
        $request->validate([
            'academic_year_id' => 'required|integer',
            'program_id' => 'required|integer',
            'year_level' => 'required|integer',
            'number_of_sections' => 'required|integer|min:1',
        ]);

        $academicYearId = $request->input('academic_year_id');
        $programId = $request->input('program_id');
        $yearLevel = $request->input('year_level');
        $requestedSections = $request->input('number_of_sections');

        try {
            $sectionsWithSchedules = DB::table('sections_per_program_year')
                ->select('sections_per_program_year.section_name', 'sections_per_program_year.sections_per_program_year_id')
                ->join('section_courses', 'sections_per_program_year.sections_per_program_year_id', '=', 'section_courses.sections_per_program_year_id')
                ->join('schedules', 'section_courses.section_course_id', '=', 'schedules.section_course_id')
                ->where('sections_per_program_year.academic_year_id', $academicYearId)
                ->where('sections_per_program_year.program_id', $programId)
                ->where('sections_per_program_year.year_level', $yearLevel)
                ->where(function ($query) {
                    $query->whereNotNull('schedules.day')
                        ->orWhereNotNull('schedules.start_time')
                        ->orWhereNotNull('schedules.end_time')
                        ->orWhereNotNull('schedules.faculty_id')
                        ->orWhereNotNull('schedules.room_id');
                })
                ->distinct()
                ->get();

            $existingSections = SectionsPerProgramYear::where('academic_year_id', $academicYearId)
                ->where('program_id', $programId)
                ->where('year_level', $yearLevel)
                ->orderBy('section_name')
                ->get();

            if ($requestedSections < $existingSections->count()) {
                $sectionsToRemove = $existingSections->slice($requestedSections);

                foreach ($sectionsToRemove as $section) {
                    if ($sectionsWithSchedules->contains('sections_per_program_year_id', $section->sections_per_program_year_id)) {
                        return response()->json([
                            'status' => 'error',
                            'message' => "Cannot remove section {$section->section_name} as it has assigned schedules.",
                        ], 422);
                    }
                }
            }

            $currentSectionCount = $existingSections->count();
            $programCode = Program::find($programId)->program_code ?? 'Unknown';

            if ($currentSectionCount == $requestedSections) {
                return response()->json([
                    'message' => 'The number of sections is already correct. No changes were made.',
                ], 200);
            }

            if ($requestedSections > $currentSectionCount) {
                $sectionsToAdd = $requestedSections - $currentSectionCount;

                for ($i = 1; $i <= $sectionsToAdd; $i++) {
                    $newSection = new SectionsPerProgramYear();
                    $newSection->academic_year_id = $academicYearId;
                    $newSection->program_id = $programId;
                    $newSection->year_level = $yearLevel;
                    $newSection->section_name = (string) ($currentSectionCount + $i);
                    $newSection->save();
                }

                // ═══════════════════════════════════════════════════════
                // AUDIT LOG: Sections Added
                // ═══════════════════════════════════════════════════════
                AuditLogger::logUpdate(
                    model: 'SectionsPerProgramYear',
                    modelId: $programId,
                    oldData: ['sections' => $currentSectionCount],
                    newData: ['sections' => $requestedSections],
                    description: "Updated {$programCode} Year {$yearLevel} - Sections Count: {$currentSectionCount} → {$requestedSections}"
                );

                return response()->json([
                    'message' => $sectionsToAdd . ' sections were added successfully.',
                ], 201);

            } elseif ($requestedSections < $currentSectionCount) {
                $sectionsToDelete = $currentSectionCount - $requestedSections;

                $sectionsToRemove = SectionsPerProgramYear::where('academic_year_id', $academicYearId)
                    ->where('program_id', $programId)
                    ->where('year_level', $yearLevel)
                    ->orderBy('sections_per_program_year_id', 'desc')
                    ->take($sectionsToDelete)
                    ->get();

                foreach ($sectionsToRemove as $section) {
                    $section->delete();
                }

                // ═══════════════════════════════════════════════════════
                // AUDIT LOG: Sections Removed
                // ═══════════════════════════════════════════════════════
                AuditLogger::logUpdate(
                    model: 'SectionsPerProgramYear',
                    modelId: $programId,
                    oldData: ['sections' => $currentSectionCount],
                    newData: ['sections' => $requestedSections],
                    description: "Updated {$programCode} Year {$yearLevel} - Sections Count: {$currentSectionCount} → {$requestedSections}"
                );

                return response()->json([
                    'message' => $sectionsToDelete . ' sections were removed successfully.',
                ], 200);
            }

        } catch (\Exception $e) {
            return response()->json(['message' => 'An error occurred: ' . $e->getMessage()], 500);
        }
    }

    public function removeProgramFromAcademicYear(Request $request)
    {
        $request->validate([
            'academic_year_id' => 'required|integer',
            'program_id' => 'required|integer',
        ]);

        $academicYearId = $request->input('academic_year_id');
        $programId = $request->input('program_id');

        try {
            $programCount = ProgramYearLevelCurricula::where('academic_year_id', $academicYearId)
                ->distinct('program_id')
                ->count('program_id');

            if ($programCount <= 1) {
                $programCode = DB::table('programs')->where('program_id', $programId)->value('program_code') ?? 'Unknown Program';
                return response()->json([
                    'status' => 'error',
                    'message' => "Cannot delete \"{$programCode}\". At least one program must be present.",
                ], 200);
            }

            $programCode = DB::table('programs')->where('program_id', $programId)->value('program_code') ?? 'Unknown Program';

            $hasSchedules = DB::table('schedules')
                ->join('section_courses', 'schedules.section_course_id', '=', 'section_courses.section_course_id')
                ->join('sections_per_program_year', 'section_courses.sections_per_program_year_id', '=', 'sections_per_program_year.sections_per_program_year_id')
                ->where('sections_per_program_year.program_id', $programId)
                ->where('sections_per_program_year.academic_year_id', $academicYearId)
                ->where(function ($query) {
                    $query->whereNotNull('schedules.day')
                        ->orWhereNotNull('schedules.start_time')
                        ->orWhereNotNull('schedules.end_time')
                        ->orWhereNotNull('schedules.faculty_id')
                        ->orWhereNotNull('schedules.room_id');
                })
                ->exists();

            if ($hasSchedules) {
                return response()->json([
                    'status' => 'error',
                    'message' => "Cannot delete \"{$programCode}\" program because it has associated schedules.",
                ], 200);
            }

            DB::beginTransaction();

            ProgramYearLevelCurricula::where('academic_year_id', $academicYearId)->where('program_id', $programId)->delete();
            SectionsPerProgramYear::where('academic_year_id', $academicYearId)->where('program_id', $programId)->delete();

            DB::commit();

            // ═══════════════════════════════════════════════════════
            // AUDIT LOG: Program removed from A.Y.
            // ═══════════════════════════════════════════════════════
            AuditLogger::logDelete(
                model: 'ProgramYearLevelCurricula',
                modelId: $programId,
                data: ['program_code' => $programCode, 'academic_year_id' => $academicYearId],
                description: "Removed program \"{$programCode}\" entirely from Academic Year configuration."
            );

            return response()->json([
                'status' => 'success',
                'message' => "Program \"{$programCode}\" removed successfully from this academic year.",
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => 'An error occurred: ' . $e->getMessage()], 500);
        }
    }

    public function getOfferedCoursesBySem()
    {
        $activeSemester = DB::table('active_semesters')
            ->where('is_active', 1)
            ->first();

        if (!$activeSemester) {
            return response()->json(['error' => 'No active semester found'], 404);
        }

        $allSections = DB::table('sections_per_program_year')
            ->where('academic_year_id', $activeSemester->academic_year_id)
            ->get();

        $sectionsGrouped = [];
        foreach ($allSections as $section) {
            $sectionsGrouped[$section->program_id][$section->year_level][] = [
                'section_id' => $section->sections_per_program_year_id,
                'section_name' => $section->section_name,
            ];
        }

        $assignedCourses = DB::table('program_year_level_curricula as pylc')
            ->select(
                'p.program_id',
                'p.program_code',
                'p.program_title',
                'pylc.year_level',
                'c.curriculum_id',
                'c.curriculum_year',
                'ay.year_start',
                'ay.year_end',
                's.semester',
                'co.course_id',
                'co.course_code',
                'co.course_title',
                'co.lec_hours',
                'co.lab_hours',
                'co.units',
                'co.tuition_hours',
                'ca.course_assignment_id'
            )
            ->join('programs as p', 'pylc.program_id', '=', 'p.program_id')
            ->join('curricula as c', 'pylc.curriculum_id', '=', 'c.curriculum_id')
            ->join('academic_years as ay', 'pylc.academic_year_id', '=', 'ay.academic_year_id')
            ->join('curricula_program as cp', function ($join) {
                $join->on('pylc.program_id', '=', 'cp.program_id')
                    ->on('pylc.curriculum_id', '=', 'cp.curriculum_id');
            })
            ->leftJoin('year_levels as yl', function ($join) {
                $join->on('cp.curricula_program_id', '=', 'yl.curricula_program_id')
                    ->on('pylc.year_level', '=', 'yl.year');
            })
            ->leftJoin('semesters as s', function ($join) use ($activeSemester) {
                $join->on('yl.year_level_id', '=', 's.year_level_id')
                    ->where('s.semester', $activeSemester->semester_id);
            })
            ->leftJoin('course_assignments as ca', function ($join) {
                $join->on('ca.semester_id', '=', 's.semester_id')
                    ->on('ca.curricula_program_id', '=', 'cp.curricula_program_id');
            })
            ->leftJoin('courses as co', 'ca.course_id', '=', 'co.course_id')
            ->where('pylc.academic_year_id', $activeSemester->academic_year_id)
            ->orderBy('p.program_id')
            ->orderBy('pylc.year_level')
            ->orderBy('s.semester')
            ->get();

        $response = [
            'active_semester_id' => $activeSemester->active_semester_id,
            'academic_year_id' => $activeSemester->academic_year_id,
            'semester_id' => $activeSemester->semester_id,
            'programs' => [],
        ];

        foreach ($assignedCourses as $row) {
            $programIndex = array_search($row->program_id, array_column($response['programs'], 'program_id'));

            if ($programIndex === false) {
                $response['programs'][] = [
                    'program_id' => $row->program_id,
                    'program_code' => $row->program_code,
                    'program_title' => $row->program_title,
                    'year_levels' => [],
                ];
                $programIndex = count($response['programs']) - 1;
            }

            $yearLevelIndex = false;
            foreach ($response['programs'][$programIndex]['year_levels'] as $index => $yearLevel) {
                if ($yearLevel['year_level'] == $row->year_level && $yearLevel['curriculum_id'] == $row->curriculum_id) {
                    $yearLevelIndex = $index;
                    break;
                }
            }

            if ($yearLevelIndex === false) {
                $sections = $sectionsGrouped[$row->program_id][$row->year_level] ?? [];
                $response['programs'][$programIndex]['year_levels'][] = [
                    'year_level' => $row->year_level,
                    'curriculum_id' => $row->curriculum_id,
                    'curriculum_year' => $row->curriculum_year,
                    'sections' => $sections,
                    'semester' => [
                        'semester' => $activeSemester->semester_id,
                        'courses' => [],
                    ],
                ];
                $yearLevelIndex = count($response['programs'][$programIndex]['year_levels']) - 1;
            }

            if ($row->course_id !== null) {
                $response['programs'][$programIndex]['year_levels'][$yearLevelIndex]['semester']['courses'][] = [
                    'course_assignment_id' => $row->course_assignment_id,
                    'course_id' => $row->course_id,
                    'course_code' => $row->course_code,
                    'course_title' => $row->course_title,
                    'lec_hours' => $row->lec_hours,
                    'lab_hours' => $row->lab_hours,
                    'units' => $row->units,
                    'tuition_hours' => $row->tuition_hours,
                    'year_level' => $row->year_level,
                ];
            }
        }

        return response()->json($response);
    }
}