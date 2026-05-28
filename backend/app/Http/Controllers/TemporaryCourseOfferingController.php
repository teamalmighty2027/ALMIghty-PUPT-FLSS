<?php

namespace App\Http\Controllers;

use App\Models\BridgingCourse;
use App\Models\TemporaryCourseOffering;
use App\Services\AuditLogger;
use App\Services\FileService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class TemporaryCourseOfferingController extends Controller
{
    private const PETITION_TYPES = ['petition', 'tutorial'];
    private const DEFAULT_MIN_PETITIONERS = [
        'petition' => 45,
        'tutorial' => 1,
        'summer' => 0,
        'bridging' => 0,
    ];
    private const PETITION_STORAGE_DIR = 'temporary-course-offerings';

    /**
     * Returns temporary course offerings filtered by the provided query
     * parameters.
     *
     * @param Request $request Incoming request with optional filters.
     */
    public function index(Request $request)
    {
        $validated = $request->validate([
            'academic_year_id' => 'nullable|integer|exists:academic_years,academic_year_id',
            'semester_id' => 'nullable|integer|exists:semesters,semester_id',
            'program_id' => 'nullable|integer|exists:programs,program_id',
            'year_level' => 'nullable|integer|min:1',
            'section_per_program_year_id' => 'nullable|integer|exists:sections_per_program_year,sections_per_program_year_id',
            'applies_to_all_sections' => 'nullable|boolean',
            'type' => 'nullable|in:summer,bridging,tutorial,petition',
            'status' => 'nullable|in:Pending,Approved,Rejected',
            'is_archived' => 'nullable|boolean',
        ]);

        $query = TemporaryCourseOffering::query()
            ->with(['course', 'program', 'section']);

        if (array_key_exists('academic_year_id', $validated)) {
            $query->where('academic_year_id', $validated['academic_year_id']);
        }

        if (array_key_exists('semester_id', $validated)) {
            $query->where('semester_id', $validated['semester_id']);
        }

        if (array_key_exists('program_id', $validated)) {
            $query->where('program_id', $validated['program_id']);
        }

        if (array_key_exists('year_level', $validated)) {
            $query->where('year_level', $validated['year_level']);
        }

        if (array_key_exists('section_per_program_year_id', $validated)) {
            $query->where('section_per_program_year_id', $validated['section_per_program_year_id']);
        }

        if (array_key_exists('applies_to_all_sections', $validated)) {
            $query->where('applies_to_all_sections', $request->boolean('applies_to_all_sections'));
        }

        if (array_key_exists('type', $validated)) {
            $query->where('type', $validated['type']);
        }

        if (array_key_exists('status', $validated)) {
            $query->where('status', $validated['status']);
        }

        if ($request->has('is_archived')) {
            $query->where('is_archived', $request->boolean('is_archived'));
        } else {
            $query->where('is_archived', false);
        }

        return response()->json($query->orderByDesc('created_at')->get());
    }

    /**
     * Returns a single temporary course offering with related data.
     *
     * @param int $id Temporary course offering identifier.
     */
    public function show(int $id)
    {
        $offering = TemporaryCourseOffering::with(['course', 'program', 'section'])->findOrFail($id);

        return response()->json([
            'data' => $offering,
        ]);
    }

    /**
     * Creates a new temporary course offering and stores its petition file.
     *
     * @param Request $request Incoming request containing offering data.
     * @param FileService $fileService File storage service for uploads.
     */
    public function store(Request $request, FileService $fileService)
    {
        $validated = $request->validate([
            'course_id' => 'required|integer|exists:courses,course_id',
            'bridging_course_id' => 'nullable|integer|exists:bridging_courses,bridging_course_id',
            'academic_year_id' => 'required|integer|exists:academic_years,academic_year_id',
            'semester_id' => 'required|integer|exists:semesters,semester_id',
            'program_id' => 'required|integer|exists:programs,program_id',
            'year_level' => 'required|integer|min:1',
            'section_per_program_year_id' => 'nullable|integer|exists:sections_per_program_year,sections_per_program_year_id',
            'applies_to_all_sections' => 'required|boolean',
            'type' => 'required|in:summer,bridging,tutorial,petition',
            'status' => 'nullable|in:Pending,Approved,Rejected',
            'min_petitioners' => 'nullable|integer|min:0',
            'petitioners_count' => 'nullable|integer|min:0',
            'petition_file' => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:10240',
        ]);

        $type = $validated['type'];
        $appliesToAll = filter_var($validated['applies_to_all_sections'], FILTER_VALIDATE_BOOLEAN);

        if ($type === 'bridging') {
            if (empty($validated['bridging_course_id'])) {
                return response()->json([
                    'message' => 'Bridging course is required for bridging type.',
                ], 422);
            }

            $bridgingCourse = BridgingCourse::find($validated['bridging_course_id']);
            $bridgingYearLevel = $bridgingCourse?->yearLevel?->year;

            if (! $bridgingCourse
                || (int) $bridgingCourse->program_id !== (int) $validated['program_id']
                || (int) $bridgingYearLevel !== (int) $validated['year_level']
            ) {
                return response()->json([
                    'message' => 'Selected bridging course does not match the program or year level.',
                ], 422);
            }

            if ((int) $bridgingCourse->course_id !== (int) $validated['course_id']) {
                $validated['course_id'] = $bridgingCourse->course_id;
            }
        } else {
            $validated['bridging_course_id'] = null;
        }

        if (in_array($type, self::PETITION_TYPES, true) && ! $request->hasFile('petition_file')) {
            return response()->json([
                'message' => 'Petition file is required for this course type.',
            ], 422);
        }

        if (! $appliesToAll && empty($validated['section_per_program_year_id'])) {
            return response()->json([
                'message' => 'Section is required when not applying to all sections.',
            ], 422);
        }

        if ($appliesToAll) {
            $validated['section_per_program_year_id'] = null;

            if (! $this->hasSectionsInScope($validated['academic_year_id'], $validated['program_id'], $validated['year_level'])) {
                return response()->json([
                    'message' => 'No sections found for the selected academic year, program, and year level.',
                ], 422);
            }
        } else if (! $this->sectionMatchesScope(
            $validated['section_per_program_year_id'],
            $validated['academic_year_id'],
            $validated['program_id'],
            $validated['year_level']
        )) {
            return response()->json([
                'message' => 'Selected section does not match the academic year, program, or year level.',
            ], 422);
        }

        $validated['min_petitioners'] = $validated['min_petitioners']
            ?? self::DEFAULT_MIN_PETITIONERS[$type];
        $validated['petitioners_count'] = $validated['petitioners_count'] ?? 0;
        $validated['status'] = $validated['status'] ?? 'Approved';
        $validated['created_by'] = Auth::id();
        $validated['applies_to_all_sections'] = $appliesToAll;

        if ($request->hasFile('petition_file')) {
            $validated['petition_file_path'] = $fileService->store(
                $request->file('petition_file'),
                self::PETITION_STORAGE_DIR
            );
        }

        $offering = DB::transaction(function () use ($validated) {
            return TemporaryCourseOffering::create($validated);
        });

        AuditLogger::logCreate(
            model: 'TemporaryCourseOffering',
            modelId: $offering->temporary_course_offering_id,
            data: $offering->toArray(),
            description: 'Created temporary course offering.'
        );

        return response()->json([
            'message' => 'Temporary course offering created successfully.',
            'data' => $offering,
        ], 201);
    }

    /**
     * Updates an existing temporary course offering and replaces its file if
     * a new petition attachment is provided.
     *
     * @param Request $request Incoming request containing update data.
     * @param int $id Temporary course offering identifier.
     * @param FileService $fileService File storage service for uploads.
     */
    public function update(Request $request, int $id, FileService $fileService)
    {
        $offering = TemporaryCourseOffering::findOrFail($id);
        $oldData = $offering->toArray();

        $validated = $request->validate([
            'course_id' => 'sometimes|required|integer|exists:courses,course_id',
            'bridging_course_id' => 'nullable|integer|exists:bridging_courses,bridging_course_id',
            'academic_year_id' => 'sometimes|required|integer|exists:academic_years,academic_year_id',
            'semester_id' => 'sometimes|required|integer|exists:semesters,semester_id',
            'program_id' => 'sometimes|required|integer|exists:programs,program_id',
            'year_level' => 'sometimes|required|integer|min:1',
            'section_per_program_year_id' => 'nullable|integer|exists:sections_per_program_year,sections_per_program_year_id',
            'applies_to_all_sections' => 'sometimes|required|boolean',
            'type' => 'sometimes|required|in:summer,bridging,tutorial,petition',
            'status' => 'sometimes|required|in:Pending,Approved,Rejected',
            'min_petitioners' => 'nullable|integer|min:0',
            'petitioners_count' => 'nullable|integer|min:0',
            'petition_file' => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:10240',
            'is_archived' => 'sometimes|required|boolean',
        ]);

        $type = $validated['type'] ?? $offering->type;
        $appliesToAll = array_key_exists('applies_to_all_sections', $validated)
            ? filter_var($validated['applies_to_all_sections'], FILTER_VALIDATE_BOOLEAN)
            : (bool) $offering->applies_to_all_sections;

        $academicYearId = $validated['academic_year_id'] ?? $offering->academic_year_id;
        $programId = $validated['program_id'] ?? $offering->program_id;
        $yearLevel = $validated['year_level'] ?? $offering->year_level;
        $sectionId = $validated['section_per_program_year_id'] ?? $offering->section_per_program_year_id;
        $bridgingCourseId = $validated['bridging_course_id'] ?? $offering->bridging_course_id;

        if ($type === 'bridging') {
            if (empty($bridgingCourseId)) {
                return response()->json([
                    'message' => 'Bridging course is required for bridging type.',
                ], 422);
            }

            $bridgingCourse = BridgingCourse::find($bridgingCourseId);

            $bridgingYearLevel = $bridgingCourse?->yearLevel?->year;

            if (! $bridgingCourse
                || (int) $bridgingCourse->program_id !== (int) $programId
                || (int) $bridgingYearLevel !== (int) $yearLevel
            ) {
                return response()->json([
                    'message' => 'Selected bridging course does not match the program or year level.',
                ], 422);
            }

            if ((int) $bridgingCourse->course_id !== (int) ($validated['course_id'] ?? $offering->course_id)) {
                $validated['course_id'] = $bridgingCourse->course_id;
            }

            $validated['bridging_course_id'] = $bridgingCourseId;
        } else {
            $validated['bridging_course_id'] = null;
        }

        if (! $appliesToAll && empty($sectionId)) {
            return response()->json([
                'message' => 'Section is required when not applying to all sections.',
            ], 422);
        }

        if ($appliesToAll) {
            $validated['section_per_program_year_id'] = null;

            if (! $this->hasSectionsInScope($academicYearId, $programId, $yearLevel)) {
                return response()->json([
                    'message' => 'No sections found for the selected academic year, program, and year level.',
                ], 422);
            }
        } else if (! $this->sectionMatchesScope($sectionId, $academicYearId, $programId, $yearLevel)) {
            return response()->json([
                'message' => 'Selected section does not match the academic year, program, or year level.',
            ], 422);
        }

        if (in_array($type, self::PETITION_TYPES, true)
            && ! $request->hasFile('petition_file')
            && empty($offering->petition_file_path)
        ) {
            return response()->json([
                'message' => 'Petition file is required for this course type.',
            ], 422);
        }

        if ($request->hasFile('petition_file')) {
            $fileService->deleteIfExists($offering->petition_file_path);
            $validated['petition_file_path'] = $fileService->store(
                $request->file('petition_file'),
                self::PETITION_STORAGE_DIR
            );
        }

        if (! array_key_exists('min_petitioners', $validated)) {
            $validated['min_petitioners'] = $offering->min_petitioners
                ?: self::DEFAULT_MIN_PETITIONERS[$type];
        }

        if (! array_key_exists('petitioners_count', $validated)) {
            $validated['petitioners_count'] = $offering->petitioners_count ?? 0;
        }

        $validated['applies_to_all_sections'] = $appliesToAll;

        $offering->fill($validated);

        if (! $offering->isDirty()) {
            return response()->json([
                'message' => 'No changes detected.',
            ], 422);
        }

        $offering->save();

        AuditLogger::logUpdate(
            model: 'TemporaryCourseOffering',
            modelId: $offering->temporary_course_offering_id,
            oldData: $oldData,
            newData: $offering->toArray(),
            description: 'Updated temporary course offering.'
        );

        return response()->json([
            'message' => 'Temporary course offering updated successfully.',
            'data' => $offering,
        ]);
    }

    /**
     * Archives or unarchives a temporary course offering and clears linked
     * schedules when archiving.
     *
     * @param Request $request Incoming request with the archive flag.
     * @param int $id Temporary course offering identifier.
     */
    public function archive(Request $request, int $id)
    {
        $offering = TemporaryCourseOffering::findOrFail($id);
        $oldData = $offering->toArray();

        $validated = $request->validate([
            'is_archived' => 'nullable|boolean',
        ]);

        $targetArchived = array_key_exists('is_archived', $validated)
            ? (bool) $validated['is_archived']
            : true;

        return DB::transaction(function () use (
            $offering,
            $oldData,
            $targetArchived
        ) {
            $scheduleResetCount = 0;

            if ($targetArchived) {
                $scheduleResetCount =
                    $this->clearSchedulesForTemporaryOffering($offering);
            }

            $offering->is_archived = $targetArchived;

            if (! $offering->isDirty() && $scheduleResetCount === 0) {
                return response()->json([
                    'message' => 'No changes detected.',
                ], 422);
            }

            if ($offering->isDirty()) {
                $offering->save();
            }

            AuditLogger::logUpdate(
                model: 'TemporaryCourseOffering',
                modelId: $offering->temporary_course_offering_id,
                oldData: $oldData,
                newData: $offering->toArray(),
                description: $targetArchived
                    ? 'Archived temporary course offering.'
                    : 'Unarchived temporary course offering.'
            );

            return response()->json([
                'message' => $targetArchived
                    ? 'Temporary course offering archived successfully.'
                    : 'Temporary course offering unarchived successfully.',
                'data' => $offering,
            ]);
        });
    }

    /**
     * Clears schedule assignments for all section courses linked to an
     * offering.
     *
     * @param TemporaryCourseOffering $offering Offering whose schedules should
     *     be cleared.
     * @return int Number of schedule rows updated.
     */
    private function clearSchedulesForTemporaryOffering(
        TemporaryCourseOffering $offering
    ): int {
        $sectionCourseIds = $offering->sectionCourses()
            ->pluck('section_course_id');

        if ($sectionCourseIds->isEmpty()) {
            return 0;
        }

        return DB::table('schedules')
            ->whereIn('section_course_id', $sectionCourseIds)
            ->update([
                'day' => null,
                'start_time' => null,
                'end_time' => null,
                'faculty_id' => null,
                'room_id' => null,
                'updated_at' => now(),
            ]);
    }

    /**
     * Checks whether a section belongs to the expected academic scope.
     *
     * @param ?int $sectionId Section identifier to verify.
     * @param int $academicYearId Academic year identifier.
     * @param int $programId Program identifier.
     * @param int $yearLevel Year level value.
     * @return bool True when the section matches the requested scope.
     */
    private function sectionMatchesScope(?int $sectionId, int $academicYearId, int $programId, int $yearLevel): bool
    {
        if (! $sectionId) {
            return false;
        }

        return DB::table('sections_per_program_year')
            ->where('sections_per_program_year_id', $sectionId)
            ->where('academic_year_id', $academicYearId)
            ->where('program_id', $programId)
            ->where('year_level', $yearLevel)
            ->exists();
    }

    /**
     * Determines whether any sections exist for the requested academic scope.
     *
     * @param int $academicYearId Academic year identifier.
     * @param int $programId Program identifier.
     * @param int $yearLevel Year level value.
     * @return bool True when at least one matching section exists.
     */
    private function hasSectionsInScope(int $academicYearId, int $programId, int $yearLevel): bool
    {
        return DB::table('sections_per_program_year')
            ->where('academic_year_id', $academicYearId)
            ->where('program_id', $programId)
            ->where('year_level', $yearLevel)
            ->exists();
    }
}
