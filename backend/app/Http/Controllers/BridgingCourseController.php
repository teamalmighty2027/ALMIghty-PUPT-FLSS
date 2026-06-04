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
    // Fetch bridging courses list with prerequisites, corequisites,
    // and combined program details.
    public function index(Request $request)
    {
        $validated = $request->validate([
            'curriculum_id' =>
                'nullable|integer|exists:curricula,curriculum_id',
            'program_id' => 'nullable|integer|exists:programs,program_id',
            'year_level_id' =>
                'nullable|integer|exists:year_levels,year_level_id',
            'semester_id' => 'nullable|integer|exists:semesters,semester_id',
        ]);

        $query = BridgingCourse::query()
            ->with([
                'course.requirements.requiredCourse',
                'program',
                'combinedWithProgram',
            ])
            ->join(
                'courses as co',
                'bridging_courses.course_id',
                '=',
                'co.course_id'
            )
            ->select(
                'bridging_courses.bridging_course_id',
                'bridging_courses.curriculum_id',
                'bridging_courses.program_id',
                'bridging_courses.year_level_id',
                'bridging_courses.semester_id',
                'bridging_courses.course_id',
                'bridging_courses.combined_with_program_id',
                'co.course_code',
                'co.course_title',
                'co.lec_hours',
                'co.lab_hours',
                'co.units',
                'co.tuition_hours'
            );

        if (array_key_exists('curriculum_id', $validated)) {
            $query->where(
                'bridging_courses.curriculum_id',
                $validated['curriculum_id']
            );
        }

        if (array_key_exists('program_id', $validated)) {
            $query->where(
                'bridging_courses.program_id',
                $validated['program_id']
            );
        }

        if (array_key_exists('year_level_id', $validated)) {
            $query->where(
                'bridging_courses.year_level_id',
                $validated['year_level_id']
            );
        }

        if (array_key_exists('semester_id', $validated)) {
            $query->where(
                'bridging_courses.semester_id',
                $validated['semester_id']
            );
        }

        $results = $query
            ->orderBy('bridging_courses.year_level_id')
            ->orderBy('bridging_courses.semester_id')
            ->orderBy('co.course_code')
            ->get();

        return response()->json($results->map(function ($bridgingCourse) {
            $course = $bridgingCourse->course;
            $combinedLabel = null;

            if ($bridgingCourse->combined_with_program_id &&
                $bridgingCourse->program &&
                $bridgingCourse->combinedWithProgram
            ) {
                $combinedLabel = collect([
                    $bridgingCourse->program->program_code,
                    $bridgingCourse->combinedWithProgram->program_code,
                ])->sortDesc()->implode('/');
            }

            return array_merge($bridgingCourse->toArray(), [
                'combined_label' => $combinedLabel,
                'prerequisites' => $course
                    ? $course->requirements
                        ->where('requirement_type', 'pre')
                        ->map(function ($req) {
                            return [
                                'course_id' =>
                                    $req->requiredCourse->course_id,
                                'course_code' =>
                                    $req->requiredCourse->course_code,
                                'course_title' =>
                                    $req->requiredCourse->course_title,
                            ];
                        })->values()
                    : [],
                'corequisites' => $course
                    ? $course->requirements
                        ->where('requirement_type', 'co')
                        ->map(function ($req) {
                            return [
                                'course_id' =>
                                    $req->requiredCourse->course_id,
                                'course_code' =>
                                    $req->requiredCourse->course_code,
                                'course_title' =>
                                    $req->requiredCourse->course_title,
                            ];
                        })->values()
                    : [],
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

    // Update an existing bridging course mapping.
    public function update(Request $request, int $id)
    {
        $validated = $request->validate([
            'curriculum_id' =>
                'required|integer|exists:curricula,curriculum_id',
            'program_id' => 'required|integer|exists:programs,program_id',
            'year_level_id' =>
                'required|integer|exists:year_levels,year_level_id',
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
                Log::error('Bridging course update aborted: duplicate entry.');

                return response()->json([
                    'message' => 'This bridging course already exists for ' .
                        'the selected program, year, semester, and course.',
                ], 422);
            }

            // If combined and identifying fields are changed, clear
            // combination in peer
            $identifyingFieldsChanged = false;
            $fields = [
                'curriculum_id',
                'program_id',
                'year_level_id',
                'semester_id',
                'course_id',
            ];

            foreach ($fields as $field) {
                if (isset($validated[$field]) &&
                    $validated[$field] != $bridgingCourse->$field
                ) {
                    $identifyingFieldsChanged = true;
                }
            }

            if ($identifyingFieldsChanged &&
                $bridgingCourse->combined_with_program_id
            ) {
                $peer = BridgingCourse::where([
                    'course_id' => $bridgingCourse->course_id,
                    'year_level_id' => $bridgingCourse->year_level_id,
                    'semester_id' => $bridgingCourse->semester_id,
                    'program_id' => $bridgingCourse->combined_with_program_id,
                ])->first();

                if ($peer) {
                    $oldDataPeer = $peer->toArray();
                    $peer->combined_with_program_id = null;
                    $peer->save();

                    AuditLogger::logUpdate(
                        model: 'BridgingCourse',
                        modelId: $peer->bridging_course_id,
                        oldData: $oldDataPeer,
                        newData: $peer->toArray(),
                        description: 'Uncombined course due to peer update.'
                    );
                }
                $bridgingCourse->combined_with_program_id = null;
            }

            $bridgingCourse->fill($validated);

            if (! $bridgingCourse->isDirty()) {
                DB::rollBack();
                Log::error('Bridging course update aborted: no changes.');

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

    // Delete a bridging course mapping and clear any peer combination.
    public function destroy(int $id)
    {
        DB::beginTransaction();

        try {
            $bridgingCourse = BridgingCourse::findOrFail($id);
            $oldData = $bridgingCourse->toArray();

            // If combined, clear the reference in the peer bridging course
            if ($bridgingCourse->combined_with_program_id) {
                $peer = BridgingCourse::where([
                    'course_id' => $bridgingCourse->course_id,
                    'year_level_id' => $bridgingCourse->year_level_id,
                    'semester_id' => $bridgingCourse->semester_id,
                    'program_id' => $bridgingCourse->combined_with_program_id,
                ])->first();

                if ($peer) {
                    $oldDataPeer = $peer->toArray();
                    $peer->combined_with_program_id = null;
                    $peer->save();

                    AuditLogger::logUpdate(
                        model: 'BridgingCourse',
                        modelId: $peer->bridging_course_id,
                        oldData: $oldDataPeer,
                        newData: $peer->toArray(),
                        description: 'Uncombined course due to peer deletion.'
                    );
                }
            }

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

    // Combine this bridging course with another program's bridging course.
    public function combine(Request $request, int $id)
    {
        $validated = $request->validate([
            'combined_with_program_id' =>
                'nullable|integer|exists:programs,program_id',
        ]);

        DB::beginTransaction();

        try {
            $bridgingCourse = BridgingCourse::findOrFail($id);
            $oldDataCurrent = $bridgingCourse->toArray();
            $targetProgramId = $validated['combined_with_program_id'] ?? null;

            if ($targetProgramId) {
                if ($bridgingCourse->program_id === $targetProgramId) {
                    DB::rollBack();
                    return response()->json([
                        'message' => 'Cannot combine with the same program.',
                    ], 422);
                }

                $peer = BridgingCourse::where([
                    'course_id' => $bridgingCourse->course_id,
                    'year_level_id' => $bridgingCourse->year_level_id,
                    'semester_id' => $bridgingCourse->semester_id,
                    'program_id' => $targetProgramId,
                ])->first();

                if (!$peer) {
                    DB::rollBack();
                    return response()->json([
                        'message' => 'No matching course in target program.',
                    ], 422);
                }

                $oldDataPeer = $peer->toArray();

                // Clear previous combinations if they exist
                if ($bridgingCourse->combined_with_program_id) {
                    BridgingCourse::where(
                        'program_id',
                        $bridgingCourse->combined_with_program_id
                    )->where([
                        'course_id' => $bridgingCourse->course_id,
                        'year_level_id' => $bridgingCourse->year_level_id,
                        'semester_id' => $bridgingCourse->semester_id,
                        'combined_with_program_id' => $bridgingCourse->program_id
                    ])->update(['combined_with_program_id' => null]);
                }

                if ($peer->combined_with_program_id) {
                    BridgingCourse::where(
                        'program_id',
                        $peer->combined_with_program_id
                    )->where([
                        'course_id' => $peer->course_id,
                        'year_level_id' => $peer->year_level_id,
                        'semester_id' => $peer->semester_id,
                        'combined_with_program_id' => $peer->program_id
                    ])->update(['combined_with_program_id' => null]);
                }

                $bridgingCourse->combined_with_program_id = $targetProgramId;
                $bridgingCourse->save();

                $peer->combined_with_program_id = $bridgingCourse->program_id;
                $peer->save();

                AuditLogger::logUpdate(
                    model: 'BridgingCourse',
                    modelId: $bridgingCourse->bridging_course_id,
                    oldData: $oldDataCurrent,
                    newData: $bridgingCourse->toArray(),
                    description: 'Combined with program ' . $targetProgramId
                );

                AuditLogger::logUpdate(
                    model: 'BridgingCourse',
                    modelId: $peer->bridging_course_id,
                    oldData: $oldDataPeer,
                    newData: $peer->toArray(),
                    description: 'Combined with program ' .
                        $bridgingCourse->program_id
                );
            } else {
                // Uncombine
                $oldPeerProgramId = $bridgingCourse->combined_with_program_id;

                if ($oldPeerProgramId) {
                    $peer = BridgingCourse::where([
                        'course_id' => $bridgingCourse->course_id,
                        'year_level_id' => $bridgingCourse->year_level_id,
                        'semester_id' => $bridgingCourse->semester_id,
                        'program_id' => $oldPeerProgramId,
                    ])->first();

                    if ($peer) {
                        $oldDataPeer = $peer->toArray();
                        $peer->combined_with_program_id = null;
                        $peer->save();

                        AuditLogger::logUpdate(
                            model: 'BridgingCourse',
                            modelId: $peer->bridging_course_id,
                            oldData: $oldDataPeer,
                            newData: $peer->toArray(),
                            description: 'Uncombined bridging course.'
                        );
                    }
                }

                $bridgingCourse->combined_with_program_id = null;
                $bridgingCourse->save();

                AuditLogger::logUpdate(
                    model: 'BridgingCourse',
                    modelId: $bridgingCourse->bridging_course_id,
                    oldData: $oldDataCurrent,
                    newData: $bridgingCourse->toArray(),
                    description: 'Uncombined bridging course.'
                );
            }

            DB::commit();

            $bridgingCourse->load(['program', 'combinedWithProgram']);
            $combinedLabel = null;

            if ($bridgingCourse->combined_with_program_id &&
                $bridgingCourse->program &&
                $bridgingCourse->combinedWithProgram
            ) {
                $combinedLabel = collect([
                    $bridgingCourse->program->program_code,
                    $bridgingCourse->combinedWithProgram->program_code,
                ])->sortDesc()->implode('/');
            }

            return response()->json([
                'message' => 'Combination updated successfully.',
                'data' => array_merge($bridgingCourse->toArray(), [
                    'combined_label' => $combinedLabel,
                ]),
            ]);
        } catch (Throwable $error) {
            DB::rollBack();
            Log::error(
                'Failed to combine bridging course: ' . $error->getMessage()
            );

            return response()->json([
                'message' => 'Error combining bridging course. Please try again.',
            ], 500);
        }
    }
}
