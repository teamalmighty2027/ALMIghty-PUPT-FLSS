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
            'year_level' => 'nullable|integer|min:1',
        ]);

        $query = DB::table('bridging_courses as bc')
            ->join('courses as co', 'bc.course_id', '=', 'co.course_id')
            ->select(
                'bc.bridging_course_id',
                'bc.curriculum_id',
                'bc.program_id',
                'bc.year_level',
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

        if (array_key_exists('year_level', $validated)) {
            $query->where('bc.year_level', $validated['year_level']);
        }

        return response()->json(
            $query
                ->orderBy('bc.year_level')
                ->orderBy('co.course_code')
                ->get()
        );
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'curriculum_id' => 'required|integer|exists:curricula,curriculum_id',
            'program_id' => 'required|integer|exists:programs,program_id',
            'year_level' => 'required|integer|min:1',
            'course_id' => 'required|integer|exists:courses,course_id',
        ]);

        $existing = BridgingCourse::where([
            'curriculum_id' => $validated['curriculum_id'],
            'program_id' => $validated['program_id'],
            'year_level' => $validated['year_level'],
        ])->first();

        if ($existing) {
            return response()->json([
                'message' => 'A bridging course already exists for this curriculum, program, and year level.',
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
            'year_level' => 'required|integer|min:1',
            'course_id' => 'required|integer|exists:courses,course_id',
        ]);

        $duplicate = BridgingCourse::where('bridging_course_id', '!=', $id)
            ->where([
                'curriculum_id' => $validated['curriculum_id'],
                'program_id' => $validated['program_id'],
                'year_level' => $validated['year_level'],
            ])
            ->first();

        if ($duplicate) {
            return response()->json([
                'message' => 'A bridging course already exists for this curriculum, program, and year level.',
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
