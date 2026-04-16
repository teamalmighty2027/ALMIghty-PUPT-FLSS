<?php

namespace App\Http\Controllers;

use App\Models\BridgingCourse;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

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

        $query = BridgingCourse::query()
            ->with(['course.requirements.requiredCourse'])
            ->join('courses as co', 'bridging_courses.course_id', '=', 'co.course_id')
            ->select(
                'bridging_courses.bridging_course_id',
                'bridging_courses.curriculum_id',
                'bridging_courses.program_id',
                'bridging_courses.year_level_id',
                'bridging_courses.semester_id',
                'bridging_courses.course_id',
                'co.course_code',
                'co.course_title',
                'co.lec_hours',
                'co.lab_hours',
                'co.units',
                'co.tuition_hours'
            );

        if (array_key_exists('curriculum_id', $validated)) {
            $query->where('bridging_courses.curriculum_id', $validated['curriculum_id']);
        }

        if (array_key_exists('program_id', $validated)) {
            $query->where('bridging_courses.program_id', $validated['program_id']);
        }

        if (array_key_exists('year_level_id', $validated)) {
            $query->where('bridging_courses.year_level_id', $validated['year_level_id']);
        }

        if (array_key_exists('semester_id', $validated)) {
            $query->where('bridging_courses.semester_id', $validated['semester_id']);
        }

        $results = $query
            ->orderBy('bridging_courses.year_level_id')
            ->orderBy('bridging_courses.semester_id')
            ->orderBy('co.course_code')
            ->get();

        return response()->json($results->map(function ($bridgingCourse) {
            $course = $bridgingCourse->course;
            
            return array_merge($bridgingCourse->toArray(), [
                'prerequisites' => $course ? $course->requirements->where('requirement_type', 'pre')->map(function ($req) {
                    return [
                        'course_id' => $req->requiredCourse->course_id,
                        'course_code' => $req->requiredCourse->course_code,
                        'course_title' => $req->requiredCourse->course_title,
                    ];
                })->values() : [],
                'corequisites' => $course ? $course->requirements->where('requirement_type', 'co')->map(function ($req) {
                    return [
                        'course_id' => $req->requiredCourse->course_id,
                        'course_code' => $req->requiredCourse->course_code,
                        'course_title' => $req->requiredCourse->course_title,
                    ];
                })->values() : [],
            ]);
        }));
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

        DB::beginTransaction();

        try {
            $existing = BridgingCourse::where([
                'curriculum_id'   => $validated['curriculum_id'],
                'program_id'      => $validated['program_id'],
                'year_level_id'   => $validated['year_level_id'],
                'semester_id'     => $validated['semester_id'],
                'course_id'       => $validated['course_id'],
            ])->first();

            if ($existing) {
                DB::rollBack();
                Log::error('Bridging course create aborted due to duplicate entry.');

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

            DB::commit();

            return response()->json([
                'message' => 'Bridging course created successfully.',
                'data' => $bridgingCourse,
            ], 201);
        } catch (Throwable $error) {
            DB::rollBack();
            Log::error('Failed to create bridging course.');

            return response()->json([
                'message' => 'Error creating bridging course. Please try again.',
            ], 500);
        }
    }

    public function update(Request $request, int $id)
    {
        $validated = $request->validate([
            'curriculum_id' => 'required|integer|exists:curricula,curriculum_id',
            'program_id' => 'required|integer|exists:programs,program_id',
            'year_level_id' => 'required|integer|exists:year_levels,year_level_id',
            'semester_id' => 'required|integer|exists:semesters,semester_id',
            'course_id' => 'required|integer|exists:courses,course_id',
        ]);

        DB::beginTransaction();

        try {
            $bridgingCourse = BridgingCourse::findOrFail($id);
            $oldData = $bridgingCourse->toArray();

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
                DB::rollBack();
                Log::error('Bridging course update aborted due to duplicate entry.');

                return response()->json([
                    'message' => 'This bridging course already exists for the selected program, year, semester, and course.',
                ], 422);
            }

            $bridgingCourse->fill($validated);

            if (! $bridgingCourse->isDirty()) {
                DB::rollBack();
                Log::error('Bridging course update aborted due to no changes detected.');

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

            DB::commit();

            return response()->json([
                'message' => 'Bridging course updated successfully.',
                'data' => $bridgingCourse,
            ]);
        } catch (Throwable $error) {
            DB::rollBack();
            Log::error('Failed to update bridging course.');

            return response()->json([
                'message' => 'Error updating bridging course. Please try again.',
            ], 500);
        }
    }

    public function destroy(int $id)
    {
        DB::beginTransaction();

        try {
            $bridgingCourse = BridgingCourse::findOrFail($id);
            $oldData = $bridgingCourse->toArray();

            $bridgingCourse->delete();

            AuditLogger::logDelete(
                model: 'BridgingCourse',
                modelId: $bridgingCourse->bridging_course_id,
                data: $oldData,
                description: 'Deleted bridging course mapping.'
            );

            DB::commit();

            return response()->json([
                'message' => 'Bridging course deleted successfully.',
            ]);
        } catch (Throwable $error) {
            DB::rollBack();
            Log::error('Failed to delete bridging course.');

            return response()->json([
                'message' => 'Error deleting bridging course. Please try again.',
            ], 500);
        }
    }
}
