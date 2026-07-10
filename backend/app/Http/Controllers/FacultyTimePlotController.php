<?php

namespace App\Http\Controllers;

use App\Models\Faculty;
use App\Models\FacultyTimePlot;
use App\Models\FacultyTimePlotConfig;
use App\Models\ActiveSemester;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class FacultyTimePlotController extends Controller
{
    /**
     * Retrieves all time plots and hourly caps for a specific faculty member.
     *
     * @param Request $request The incoming HTTP request
     * @param int $faculty_id The ID of the faculty member
     * @return \Illuminate\Http\JsonResponse
     */
    public function index(Request $request, $faculty_id)
    {
        $activeSemesterId = $request->query('active_semester_id');

        if (!$activeSemesterId) {
            $activeSemester = DB::table('active_semesters')
                ->where('is_active', 1)
                ->first();

            $activeSemesterId = $activeSemester 
                ? $activeSemester->active_semester_id 
                : null;
        }

        if (!$activeSemesterId) {
            return response()->json([
                'message' => 'No active semester found.'
            ], 404);
        }

        $timePlots = FacultyTimePlot::where('faculty_id', $faculty_id)
            ->where('active_semester_id', $activeSemesterId)
            ->get();

        $configs = FacultyTimePlotConfig::all();
        $caps = [];

        foreach ($configs as $config) {
            $caps[$config->time_type] = $config->weekly_hours_cap;
        }

        return response()->json([
            'time_plots' => $timePlots,
            'caps' => $caps,
        ]);
    }

    /**
     * Stores a new faculty time plot after validating rules and conflicts.
     *
     * @param Request $request The incoming HTTP request
     * @return \Illuminate\Http\JsonResponse
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'faculty_id' => 'required|exists:faculty,id',
            'active_semester_id' => 'required|exists:active_semesters,active_semester_id',
            'time_type' => 'required|in:night_service,official_time,advising_time',
            'day' => 'required|in:Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
            'start_time' => 'required|date_format:H:i',
            'end_time' => 'required|date_format:H:i|after:start_time',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation Error',
                'errors' => $validator->errors()
            ], 422);
        }

        $facultyId = $request->input('faculty_id');
        $activeSemesterId = $request->input('active_semester_id');
        $timeType = $request->input('time_type');
        $day = $request->input('day');
        $startTime = $request->input('start_time');
        $endTime = $request->input('end_time');

        // Retrieve faculty with relation
        $faculty = Faculty::with('facultyType')->find($facultyId);
        $facultyType = $faculty->facultyType;

        if (!$facultyType) {
            return response()->json([
                'message' => 'Faculty type not defined for this faculty.'
            ], 422);
        }

        $facultyTypeName = $facultyType->faculty_type;

        // 1. Exclude Part-Time faculty
        if ($facultyTypeName === 'Part-Time') {
            return response()->json([
                'message' => 'Part-Time faculty are not eligible'
                    . ' for any time plotting assignments.'
            ], 422);
        }

        // 2. Check eligibility based on Designee vs Regular/Temporary
        $isDesignee = !is_null($facultyType->designee_role_id) ||
            str_contains(strtolower($facultyTypeName), 'designee');


        if ($isDesignee) {
            if (!in_array($timeType, ['night_service', 'official_time'])) {
                return response()->json([
                    'message' => 'Designee faculty are only eligible'
                        . ' for Night Service and Official Time.'
                ], 422);
            }
        } else {
            if ($timeType !== 'advising_time') {
                return response()->json([
                    'message' => 'Regular and Temporary faculty are'
                        . ' only eligible for Advising Time.'
                ], 422);
            }
        }

        // 3. Cap check: calculate duration in minutes
        $startMin = $this->timeToMinutes($startTime);
        $endMin = $this->timeToMinutes($endTime);
        $newDuration = $endMin - $startMin;

        // Sum existing plotted minutes of this type for this semester
        $existingPlots = FacultyTimePlot::where('faculty_id', $facultyId)
            ->where('active_semester_id', $activeSemesterId)
            ->where('time_type', $timeType)
            ->get();

        $totalPlottedMin = 0;

        foreach ($existingPlots as $plot) {
            $pStart = $this->timeToMinutes($plot->start_time);
            $pEnd = $this->timeToMinutes($plot->end_time);
            $totalPlottedMin += ($pEnd - $pStart);
        }

        $weeklyCapHours = FacultyTimePlotConfig::capFor($timeType);
        $weeklyCapMin = $weeklyCapHours * 60;

        if (($totalPlottedMin + $newDuration) > $weeklyCapMin) {
            return response()->json([
                'message' => "Adding this slot exceeds the weekly limit of "
                    . "{$weeklyCapHours} hours for "
                    . str_replace('_', ' ', $timeType) . "."
            ], 422);
        }

        // 4. Self-overlap check
        $selfConflict = FacultyTimePlot::where('faculty_id', $facultyId)
            ->where('active_semester_id', $activeSemesterId)
            ->where('day', $day)
            ->where('start_time', '<', $endTime)
            ->where('end_time', '>', $startTime)
            ->exists();

        if ($selfConflict) {
            return response()->json([
                'message' => 'This time slot overlaps with another plotted'
                    . ' time slot for this faculty.'
            ], 422);
        }

        // 5. Course schedules overlap check
        $scheduleConflict = DB::table('schedules')
            ->join(
                'section_courses',
                'schedules.section_course_id',
                '=',
                'section_courses.section_course_id'
            )
            ->join(
                'sections_per_program_year',
                'section_courses.sections_per_program_year_id',
                '=',
                'sections_per_program_year.sections_per_program_year_id'
            )
            ->leftJoin(
                'course_assignments',
                'section_courses.course_assignment_id',
                '=',
                'course_assignments.course_assignment_id'
            )
            ->leftJoin(
                'temporary_course_offerings',
                'section_courses.temporary_course_offering_id',
                '=',
                'temporary_course_offerings.temporary_course_offering_id'
            )
            ->where('schedules.faculty_id', $facultyId)
            ->where('schedules.day', $day)
            ->where('schedules.start_time', '<', $endTime)
            ->where('schedules.end_time', '>', $startTime)
            ->where(
                'sections_per_program_year.academic_year_id',
                function ($query) use ($activeSemesterId) {
                    $query->select('academic_year_id')
                        ->from('active_semesters')
                        ->where('active_semester_id', $activeSemesterId);
                }
            )
            ->where(function ($query) use ($activeSemesterId) {
                $query->where(
                    'course_assignments.semester_id',
                    function ($sub) use ($activeSemesterId) {
                        $sub->select('semester_id')
                            ->from('active_semesters')
                            ->where('active_semester_id', $activeSemesterId);
                    }
                )
                ->orWhere(
                    'temporary_course_offerings.semester_id',
                    function ($sub) use ($activeSemesterId) {
                        $sub->select('semester_id')
                            ->from('active_semesters')
                            ->where('active_semester_id', $activeSemesterId);
                    }
                );
            })
            ->exists();


        if ($scheduleConflict) {
            return response()->json([
                'message' => 'This time slot overlaps with an assigned'
                    . ' class schedule for this faculty.'
            ], 422);
        }

        // Save new time plot
        $timePlot = FacultyTimePlot::create([
            'faculty_id' => $facultyId,
            'active_semester_id' => $activeSemesterId,
            'time_type' => $timeType,
            'day' => $day,
            'start_time' => $startTime,
            'end_time' => $endTime,
        ]);

        return response()->json([
            'message' => 'Time plot successfully created.',
            'time_plot' => $timePlot,
        ], 201);
    }

    /**
     * Deletes a faculty time plot by ID.
     *
     * @param int $id The ID of the time plot to delete
     * @return \Illuminate\Http\JsonResponse
     */
    public function destroy($id)
    {
        $timePlot = FacultyTimePlot::find($id);

        if (!$timePlot) {
            return response()->json([
                'message' => 'Time plot not found.'
            ], 404);
        }

        $timePlot->delete();

        return response()->json([
            'message' => 'Time plot successfully deleted.'
        ]);
    }

    /**
     * Utility method to convert HH:MM string to total minutes.
     *
     * @param string $time The time string in H:i:s or H:i format
     * @return int Total minutes from midnight
     */
    private function timeToMinutes(string $time): int
    {
        $parts = explode(':', $time);
        $hours = (int) $parts[0];
        $minutes = (int) $parts[1];

        return ($hours * 60) + $minutes;
    }
}
