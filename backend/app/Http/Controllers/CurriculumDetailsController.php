<?php

namespace App\Http\Controllers;

use App\Models\Curriculum;
use App\Models\CurriculaProgram;
use App\Models\CourseAssignment;

class CurriculumDetailsController extends Controller
{
    public function getCurriculumDetails($curriculumYear)
    {
        $curriculum = Curriculum::where('curriculum_year', $curriculumYear)
            ->firstOrFail();

        // Eager load everything in memory to prevent N+1 queries.
        $curriculaPrograms = CurriculaProgram::where(
            'curriculum_id',
            $curriculum->curriculum_id
        )
            ->with([
                'program',
                'yearLevels.semesters.courseAssignments.' .
                    'course.requirements.requiredCourse'
            ])
            ->get();

        $result = [
            'curriculum_id' => $curriculum->curriculum_id,
            'curriculum_year' => $curriculum->curriculum_year,
            'status' => ucfirst($curriculum->status),
            'programs' => $curriculaPrograms->map(function ($curriculaProgram) {
                return [
                    'curricula_program_id' => $curriculaProgram->curricula_program_id,
                    'program_id' => $curriculaProgram->program->program_id,
                    'name' => $curriculaProgram->program->program_code,
                    'program_code' => $curriculaProgram->program->program_code,
                    'program_title' => $curriculaProgram->program->program_title, // Add program_title here
                    'number_of_years' => $curriculaProgram->program->number_of_years,
                    'year_levels' => $this->getYearLevels($curriculaProgram),
                ];
            }),
        ];

        return response()->json($result);
    }

    private function getYearLevels($curriculaProgram)
    {
        return $curriculaProgram->yearLevels->map(function ($yearLevel) use ($curriculaProgram) {
            return [
                'year_level_id' => $yearLevel->year_level_id,
                'year' => $yearLevel->year,
                'semesters' => $this->getSemesters($yearLevel, $curriculaProgram),
            ];
        });
    }

    private function getSemesters($yearLevel, $curriculaProgram)
    {
        return $yearLevel->semesters->map(
            function ($semester) use ($yearLevel) {
                return [
                    'semester_id' => $semester->semester_id,
                    'semester' => $semester->semester,
                    'courses' => $this->getCourses(
                        $semester,
                        $yearLevel->year_level_id
                    ),
                ];
            }
        );
    }

    // Get courses from the eager loaded semester model in memory.
    private function getCourses($semester, $yearLevelId)
    {
        $courseAssignments = $semester->courseAssignments;

        // Filter out orphaned assignments whose course was deleted
        // without the DB cascade firing (defensive guard).
        return $courseAssignments
            ->filter(fn($a) => $a->course !== null)
            ->map(function ($assignment) use ($yearLevelId) {
                $course = $assignment->course;

                return [
                    'course_assignment_id' =>
                        $assignment->course_assignment_id,
                    'curricula_program_id' =>
                        $assignment->curricula_program_id,
                    'year_level_id' => $yearLevelId,
                    'course_id' => $course->course_id,
                    'course_code' => $course->course_code,
                    'course_title' => $course->course_title,
                    'lec_hours' => $course->lec_hours,
                    'lab_hours' => $course->lab_hours,
                    'units' => $course->units,
                    'tuition_hours' => $course->tuition_hours,
                    'prerequisites' =>
                        $this->getRequirements($course, 'pre'),
                    'corequisites' =>
                        $this->getRequirements($course, 'co'),
                ];
            })
            ->values();
    }

    private function getRequirements($course, $type)
    {
        // Skip requirements whose referenced course was deleted
        // without the DB cascade removing this row (defensive guard).
        return $course->requirements
            ->where('requirement_type', $type)
            ->filter(fn($req) => $req->requiredCourse !== null)
            ->map(function ($req) {
                return [
                    'course_id' => $req->requiredCourse->course_id,
                    'course_code' => $req->requiredCourse->course_code,
                    'course_title' => $req->requiredCourse->course_title,
                ];
            })
            ->values();
    }
}
