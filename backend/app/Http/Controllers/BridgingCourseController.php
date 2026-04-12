<?php

namespace App\Http\Controllers;

use App\Models\BridgingCourse;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class BridgingCourseController extends Controller
{
    public function index(Request $request)
    {
        $validated = $request->validate([
            'curriculum_id' => 'nullable|integer|exists:curricula,curriculum_id',
            'program_id' => 'nullable|integer|exists:programs,program_id',
            'year_level_id' => 'nullable|integer|exists:year_levels,year_level_id',
            'semester_id' => 'nullable|integer|exists:semesters,semester_id',
        ]);

        $query = DB::table('bridging_courses as bc')
            ->join('courses as co', 'bc.course_id', '=', 'co.course_id')
            ->select(
                'bc.bridging_course_id',
                'bc.curriculum_id',
                'bc.program_id',
                'bc.year_level_id',
                'bc.semester_id',
                'bc.course_id',
                'co.course_code',
                'co.course_title',
                'co.lec_hours',
                'co.lab_hours',
                'co.units',
                'co.tuition_hours'
            );

        if (array_key_exists('curriculum_id', $validated)) {
            $query->where('bc.curriculum_id', $validated['curriculum_id']);
        }

        if (array_key_exists('program_id', $validated)) {
            $query->where('bc.program_id', $validated['program_id']);
        }

        if (array_key_exists('year_level_id', $validated)) {
            $query->where('bc.year_level_id', $validated['year_level_id']);
        }

        if (array_key_exists('semester_id', $validated)) {
            $query->where('bc.semester_id', $validated['semester_id']);
        }

        return response()->json(
            $query
                ->orderBy('bc.year_level_id')
                ->orderBy('bc.semester_id')
                ->orderBy('co.course_code')
                ->get()
        );
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'curriculum_id' => 'required|integer|exists:curricula,curriculum_id',
            'program_id' => 'required|integer|exists:programs,program_id',
            'year_level_id' => 'required|integer|exists:year_levels,year_level_id',
            'semester_id' => 'required|integer|exists:semesters,semester_id',
            'course_id' => 'required|integer|exists:courses,course_id',
        ]);

        $existing = BridgingCourse::where([
            'curriculum_id'   => $validated['curriculum_id'],
            'program_id'      => $validated['program_id'],
            'year_level_id'   => $validated['year_level_id'],
            'semester_id'     => $validated['semester_id'],
            'course_id'       => $validated['course_id'],
        ])->first();

        if ($existing) {
            return response()->json([
                'message' => 'This bridging course already exists for the selected program, year, semester, and course.',
            ], 422);
        }

        $validated['created_by'] = Auth::id();

        $bridgingCourse = BridgingCourse::create($validated);

        AuditLogger::logCreate(
            model: 'BridgingCourse',
            modelId: $bridgingCourse->bridging_course_id,
            data: $bridgingCourse->toArray(),
            description: 'Created bridging course mapping.'
        );

        return response()->json([
            'message' => 'Bridging course created successfully.',
            'data' => $bridgingCourse,
        ], 201);
    }

    public function update(Request $request, int $id)
    {
        $bridgingCourse = BridgingCourse::findOrFail($id);
        $oldData = $bridgingCourse->toArray();

        $validated = $request->validate([
            'curriculum_id' => 'required|integer|exists:curricula,curriculum_id',
            'program_id' => 'required|integer|exists:programs,program_id',
            'year_level_id' => 'required|integer|exists:year_levels,year_level_id',
            'semester_id' => 'required|integer|exists:semesters,semester_id',
            'course_id' => 'required|integer|exists:courses,course_id',
        ]);

        $duplicate = BridgingCourse::where('bridging_course_id', '!=', $id)
            ->where([
                'curriculum_id' => $validated['curriculum_id'],
                'program_id'      => $validated['program_id'],
                'year_level_id'   => $validated['year_level_id'],
                'semester_id'     => $validated['semester_id'],
                'course_id'       => $validated['course_id'],
            ])
            ->first();

        if ($duplicate) {
            return response()->json([
                'message' => 'This bridging course already exists for the selected program, year, semester, and course.',
            ], 422);
        }

        $bridgingCourse->fill($validated);

        if (! $bridgingCourse->isDirty()) {
            return response()->json([
                'message' => 'No changes detected.',
            ], 422);
        }

        $bridgingCourse->save();

        AuditLogger::logUpdate(
            model: 'BridgingCourse',
            modelId: $bridgingCourse->bridging_course_id,
            oldData: $oldData,
            newData: $bridgingCourse->toArray(),
            description: 'Updated bridging course mapping.'
        );

        return response()->json([
            'message' => 'Bridging course updated successfully.',
            'data' => $bridgingCourse,
        ]);
    }

    public function destroy(int $id)
    {
        $bridgingCourse = BridgingCourse::findOrFail($id);
        $oldData = $bridgingCourse->toArray();

        $bridgingCourse->delete();

        AuditLogger::logDelete(
            model: 'BridgingCourse',
            modelId: $bridgingCourse->bridging_course_id,
            data: $oldData,
            description: 'Deleted bridging course mapping.'
        );

        return response()->json([
            'message' => 'Bridging course deleted successfully.',
        ]);
    }
}
