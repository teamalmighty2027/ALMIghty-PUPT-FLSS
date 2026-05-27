<?php

namespace App\Http\Controllers;

use App\Models\AcademicYearElective;
use App\Models\Curriculum;
use App\Models\CurriculumElective;
use App\Models\Elective;
use Illuminate\Http\Request;

class ElectiveController extends Controller
{
    /**
     * List elective variants grouped by slot name.
     */
    public function index(Request $request)
    {
        $includeInactive = $request->boolean('include_inactive');

        $query = Elective::query();

        if (!$includeInactive) {
            $query->where('is_active', true);
        }

        $electives = $query
            ->orderBy('elective_slot_name')
            ->orderBy('course_code')
            ->get()
            ->groupBy('elective_slot_name')
            ->map(function ($items) {
                return $items->values();
            });

        return response()->json($electives);
    }

    /**
     * Get elective variants for a specific slot name.
     */
    public function showBySlot(Request $request, string $slotName)
    {
        $includeInactive = $request->boolean('include_inactive');

        $query = Elective::query()->where(
            'elective_slot_name',
            $slotName
        );

        if (!$includeInactive) {
            $query->where('is_active', true);
        }

        $electives = $query->orderBy('course_code')->get();

        return response()->json($electives);
    }

    /**
     * Create or update a curriculum elective assignment.
     */
    public function storeCurriculumElective(Request $request)
    {
        $validated = $request->validate([
            'curriculum_id' => [
                'required',
                'integer',
                'exists:curricula,curriculum_id',
            ],
            'program_id' => [
                'required',
                'integer',
                'exists:programs,program_id',
            ],
            'year_level' => ['required', 'integer', 'min:1'],
            'semester_id' => [
                'required',
                'integer',
                'exists:semesters,semester_id',
            ],
            'elective_slot_name' => ['required', 'string', 'max:50'],
            'selected_elective_id' => [
                'required',
                'integer',
                'exists:electives,elective_id',
            ],
        ]);

        $assignment = CurriculumElective::updateOrCreate(
            [
                'curriculum_id' => $validated['curriculum_id'],
                'program_id' => $validated['program_id'],
                'year_level' => $validated['year_level'],
                'semester_id' => $validated['semester_id'],
                'elective_slot_name' => $validated['elective_slot_name'],
            ],
            [
                'selected_elective_id' =>
                    $validated['selected_elective_id'],
            ]
        );

        return response()->json([
            'message' => 'Curriculum elective saved.',
            'curriculum_elective' => $assignment,
        ]);
    }

    /**
     * Update a curriculum elective assignment.
     */
    public function updateCurriculumElective(Request $request, int $id)
    {
        $validated = $request->validate([
            'selected_elective_id' => [
                'required',
                'integer',
                'exists:electives,elective_id',
            ],
        ]);

        $assignment = CurriculumElective::findOrFail($id);
        $assignment->selected_elective_id =
            $validated['selected_elective_id'];
        $assignment->save();

        return response()->json([
            'message' => 'Curriculum elective updated.',
            'curriculum_elective' => $assignment,
        ]);
    }

    /**
     * Add a new elective variant to the pool.
     */
    public function storeElective(Request $request)
    {
        $validated = $request->validate([
            'elective_slot_name' => 'required|string|max:191',
            'course_code' => 'required|string|max:191',
            'course_title' => 'required|string|max:191',
            'lec_hours' => 'required|integer|min:0',
            'lab_hours' => 'required|integer|min:0',
            'units' => 'required|integer|min:0',
            'tuition_hours' => 'required|integer|min:0',
        ]);

        // Create it and default it to active
        $elective = Elective::create(array_merge($validated, ['is_active' => true]));

        return response()->json([
            'message' => 'Elective option added successfully.',
            'elective' => $elective
        ], 201);
    }

    /**
     * Delete an elective variant from the pool.
     */
    public function destroyElective($id)
    {
        $elective = Elective::findOrFail($id);
        $elective->delete();

        return response()->json([
            'message' => 'Elective option removed successfully.'
        ]);
    }

    /**
     * Update an existing elective variant in the pool.
     */
    public function updateElective(Request $request, $id)
    {
        $validated = $request->validate([
            'course_code' => 'required|string|max:191',
            'course_title' => 'required|string|max:191',
            'lec_hours' => 'required|integer|min:0',
            'lab_hours' => 'required|integer|min:0',
            'units' => 'required|integer|min:0',
            'tuition_hours' => 'required|integer|min:0',
        ]);

        $elective = Elective::findOrFail($id);
        $elective->update($validated);

        return response()->json([
            'message' => 'Elective option updated successfully.',
            'elective' => $elective
        ]);
    }

    /**
     * Get elective assignments for a curriculum year.
     */
    public function getCurriculumElectives(string $curriculumYear)
    {
        $curriculum = Curriculum::where(
            'curriculum_year',
            $curriculumYear
        )->firstOrFail();

        $assignments = CurriculumElective::with('elective')
            ->where('curriculum_id', $curriculum->curriculum_id)
            ->orderBy('program_id')
            ->orderBy('year_level')
            ->orderBy('semester_id')
            ->orderBy('elective_slot_name')
            ->get();

        return response()->json([
            'curriculum_id' => $curriculum->curriculum_id,
            'curriculum_year' => $curriculum->curriculum_year,
            'electives' => $assignments,
        ]);
    }

    /**
     * Create or update an academic year elective override.
     */
    public function storeAcademicYearElective(Request $request)
    {
        $validated = $request->validate([
            'academic_year_id' => [
                'required',
                'integer',
                'exists:academic_years,academic_year_id',
            ],
            'semester_id' => [
                'required',
                'integer',
                'exists:semesters,semester_id',
            ],
            'program_id' => [
                'required',
                'integer',
                'exists:programs,program_id',
            ],
            'year_level' => ['required', 'integer', 'min:1'],
            'elective_slot_name' => ['required', 'string', 'max:50'],
            'selected_elective_id' => [
                'required',
                'integer',
                'exists:electives,elective_id',
            ],
        ]);

        $override = AcademicYearElective::updateOrCreate(
            [
                'academic_year_id' => $validated['academic_year_id'],
                'semester_id' => $validated['semester_id'],
                'program_id' => $validated['program_id'],
                'year_level' => $validated['year_level'],
                'elective_slot_name' => $validated['elective_slot_name'],
            ],
            [
                'selected_elective_id' =>
                    $validated['selected_elective_id'],
            ]
        );

        return response()->json([
            'message' => 'Academic year elective saved.',
            'academic_year_elective' => $override,
        ]);
    }

    /**
     * Get elective overrides for an academic year.
     */
    public function getAcademicYearElectives(int $academicYearId)
    {
        $overrides = AcademicYearElective::with('elective')
            ->where('academic_year_id', $academicYearId)
            ->orderBy('program_id')
            ->orderBy('year_level')
            ->orderBy('semester_id')
            ->orderBy('elective_slot_name')
            ->get();

        return response()->json([
            'academic_year_id' => $academicYearId,
            'electives' => $overrides,
        ]);
    }
}
