<?php

namespace App\Http\Controllers;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\CourseRequirement;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CourseController extends Controller
{
    public function index()
    {
        // Eager load assignments and requirements
        $courses = Course::with(['assignments', 'requirements'])->get();
        return response()->json($courses);
    }

    public function addCourse(Request $request)
    {
        DB::beginTransaction();
    
        try {
            // Validate the incoming request data
            $validatedData = $request->validate([
                'course_code' => 'required|string',
                'course_title' => 'required|string',
                'lec_hours' => 'required|integer',
                'lab_hours' => 'required|integer',
                'units' => 'required|integer',
                'tuition_hours' => 'required|integer',
                'semester_id' => 'nullable|integer|exists:semesters,semester_id',
                'year_level_id' => 'nullable|integer|exists:year_levels,year_level_id',
                'curricula_program_id' => 'nullable|integer|exists:curricula_program,curricula_program_id',
                'requirements' => 'array',
                'requirements.*.requirement_type' => 'nullable|in:pre,co',
                'requirements.*.required_course_id' => 'nullable|integer|exists:courses,course_id',
            ]);
    
            // Create the new course
            $course = Course::create([
                'course_code' => $validatedData['course_code'],
                'course_title' => $validatedData['course_title'],
                'lec_hours' => $validatedData['lec_hours'],
                'lab_hours' => $validatedData['lab_hours'],
                'units' => $validatedData['units'],
                'tuition_hours' => $validatedData['tuition_hours'],
            ]);
    
            // Assign the course to a curricula program and semester if provided
            if (!empty($validatedData['semester_id']) && !empty($validatedData['curricula_program_id'])) {
                CourseAssignment::create([
                    'curricula_program_id' => $validatedData['curricula_program_id'],
                    'semester_id' => $validatedData['semester_id'],
                    'course_id' => $course->course_id,
                ]);
            }
    
            // Handle multiple requirements (pre-requisites and co-requisites)
            if (isset($validatedData['requirements']) && is_array($validatedData['requirements'])) {
                foreach ($validatedData['requirements'] as $requirement) {
                    if (!empty($requirement['requirement_type']) && !empty($requirement['required_course_id'])) {
                        CourseRequirement::create([
                            'course_id' => $course->course_id,
                            'requirement_type' => $requirement['requirement_type'],
                            'required_course_id' => $requirement['required_course_id'],
                        ]);
                    }
                }
            }

            // ═══════════════════════════════════════════════════════
            // AUDIT LOG: Course Created
            // ═══════════════════════════════════════════════════════
            AuditLogger::logCreate(
                model: 'Course',
                modelId: $course->course_id,
                data: array_merge(
                    $course->toArray(),
                    ['requirements_count' => count($validatedData['requirements'] ?? [])]
                ),
                description: "Created course: {$course->course_code} - {$course->course_title}"
            );
    
            DB::commit();
    
            return response()->json([
                'message' => 'Course added successfully',
                'course' => $course,
            ], 201);
    
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to add course', 'error' => $e->getMessage()], 500);
        }
    }
    

    public function updateCourse(Request $request, $id)
    {
        DB::beginTransaction();

        try {
            $course = Course::findOrFail($id);

            // ═══════════════════════════════════════════════════════
            // SAVE OLD DATA FOR DETAILED CHANGE TRACKING
            // ═══════════════════════════════════════════════════════
            $oldData = [
                'course_code'   => $course->course_code,
                'course_title'  => $course->course_title,
                'lec_hours'     => $course->lec_hours,
                'lab_hours'     => $course->lab_hours,
                'units'         => $course->units,
                'tuition_hours' => $course->tuition_hours,
            ];

            // Validate the incoming request data
            $validatedData = $request->validate([
                'course_code' => 'required|string',
                'course_title' => 'required|string',
                'lec_hours' => 'required|integer',
                'lab_hours' => 'required|integer',
                'units' => 'required|integer',
                'tuition_hours' => 'required|integer',
                'semester_id' => 'nullable|integer|exists:semesters,semester_id',
                'year_level_id' => 'nullable|integer|exists:year_levels,year_level_id',
                'curricula_program_id' => 'nullable|integer|exists:curricula_program,curricula_program_id',
                'requirements' => 'array',
                'requirements.*.requirement_type' => 'nullable|in:pre,co',
                'requirements.*.required_course_id' => 'nullable|integer|exists:courses,course_id',
            ]);

            // Apply updates manually to check differences
            if (isset($validatedData['course_code'])) $course->course_code = $validatedData['course_code'];
            if (isset($validatedData['course_title'])) $course->course_title = $validatedData['course_title'];
            if (isset($validatedData['lec_hours'])) $course->lec_hours = $validatedData['lec_hours'];
            if (isset($validatedData['lab_hours'])) $course->lab_hours = $validatedData['lab_hours'];
            if (isset($validatedData['units'])) $course->units = $validatedData['units'];
            if (isset($validatedData['tuition_hours'])) $course->tuition_hours = $validatedData['tuition_hours'];

            // Handle course assignments
            $assignmentChanged = false;
            if (!empty($validatedData['semester_id']) && !empty($validatedData['curricula_program_id'])) {
                $shouldUpdateAssignment = CourseAssignment::where([
                    ['course_id', '=', $course->course_id],
                    ['curricula_program_id', '=', $validatedData['curricula_program_id']],
                    ['semester_id', '=', $validatedData['semester_id']],
                ])->doesntExist();

                if ($shouldUpdateAssignment) {
                    CourseAssignment::where([
                        ['course_id', $course->course_id],
                        ['curricula_program_id', $validatedData['curricula_program_id']],
                        ['semester_id', $validatedData['semester_id']],
                    ])->delete();

                    CourseAssignment::create([
                        'curricula_program_id' => $validatedData['curricula_program_id'],
                        'semester_id' => $validatedData['semester_id'],
                        'course_id' => $course->course_id,
                    ]);
                    $assignmentChanged = true;
                }
            }

            // Handle course requirements
            $requirementsChanged = false;
            if (isset($validatedData['requirements'])) {
                CourseRequirement::where('course_id', $course->course_id)->delete();

                foreach ($validatedData['requirements'] as $requirement) {
                    if (!empty($requirement['requirement_type']) && !empty($requirement['required_course_id'])) {
                        CourseRequirement::create([
                            'course_id' => $course->course_id,
                            'requirement_type' => $requirement['requirement_type'],
                            'required_course_id' => $requirement['required_course_id'],
                        ]);
                        $requirementsChanged = true;
                    }
                }
            }

            // ═══════════════════════════════════════════════════════
            // AUDIT LOG: DETAILED CHANGE TRACKING
            // ═══════════════════════════════════════════════════════
            $changes = [];

            if ($oldData['course_code'] != $course->course_code) {
                $changes[] = "Code: {$oldData['course_code']} → {$course->course_code}";
            }
            if ($oldData['course_title'] != $course->course_title) {
                $changes[] = "Title: {$oldData['course_title']} → {$course->course_title}";
            }
            if ($oldData['lec_hours'] != $course->lec_hours) {
                $changes[] = "Lec Hours: {$oldData['lec_hours']} → {$course->lec_hours}";
            }
            if ($oldData['lab_hours'] != $course->lab_hours) {
                $changes[] = "Lab Hours: {$oldData['lab_hours']} → {$course->lab_hours}";
            }
            if ($oldData['units'] != $course->units) {
                $changes[] = "Units: {$oldData['units']} → {$course->units}";
            }
            if ($oldData['tuition_hours'] != $course->tuition_hours) {
                $changes[] = "Tuition Hours: {$oldData['tuition_hours']} → {$course->tuition_hours}";
            }
            if ($assignmentChanged) {
                $changes[] = "Semester/Program assignment updated";
            }
            if ($requirementsChanged) {
                $changes[] = "Prerequisites/Corequisites updated";
            }

            // Stop if nothing was actually changed
            if (empty($changes)) {
                DB::rollBack();
                return response()->json(['message' => 'No changes detected'], 422);
            }

            $course->save();
            DB::commit();

            // Log the changes
            $changesSummary = implode(', ', $changes);
            AuditLogger::logUpdate(
                model: 'Course',
                modelId: $course->course_id,
                oldData: $oldData,
                newData: $course->toArray(),
                description: "Updated course: {$course->course_code} - {$changesSummary}"
            );

            return response()->json([
                'message' => 'Course updated successfully',
                'course' => $course,
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to update course', 'error' => $e->getMessage()], 500);
        }
    }
    
    public function deleteCourse($id)
    {
        DB::beginTransaction();

        try {
            $course = Course::findOrFail($id);

            // ═══════════════════════════════════════════════════════
            // SAVE DATA FOR AUDIT BEFORE DELETION
            // ═══════════════════════════════════════════════════════
            $courseData = $course->toArray();
            $courseCode = $course->course_code;
            $courseTitle = $course->course_title;

            // Delete associated course assignments
            CourseAssignment::where('course_id', $course->course_id)
                ->delete();

            // Delete requirements owned by this course
            CourseRequirement::where('course_id', $course->course_id)
                ->delete();

            // Delete requirements where this course is the dependency
            // (e.g. it is listed as a pre/co-req of another course)
            CourseRequirement::where(
                'required_course_id',
                $course->course_id
            )->delete();

            // Delete the course
            $course->delete();

            // ═══════════════════════════════════════════════════════
            // AUDIT LOG: Course Deleted
            // ═══════════════════════════════════════════════════════
            AuditLogger::logDelete(
                model: 'Course',
                modelId: $id,
                data: $courseData,
                description: "Deleted course: {$courseCode} - {$courseTitle}"
            );

            DB::commit();

            return response()->json([
                'message' => 'Course deleted successfully',
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to delete course', 'error' => $e->getMessage()], 500);
        }
    }

}