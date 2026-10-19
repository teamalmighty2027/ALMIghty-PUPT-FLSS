<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class AppealConflictService
{
    /**
     * Checks for scheduling conflicts (program, faculty, room) for an appeal.
     * Returns an array containing conflict status and messages.
     *
     * @param int $scheduleId
     * @param string $day
     * @param string $startTime
     * @param string $endTime
     * @param int|null $roomId
     * @return array
     */
    public function check(
        int $scheduleId,
        string $day,
        string $startTime,
        string $endTime,
        ?int $roomId
    ): array {
        $messages = [];

        // 1. Get the active semester.
        $activeSemester = DB::table('active_semesters')
            ->where('is_active', 1)
            ->first();

        if (!$activeSemester) {
            return [
                'hasConflicts' => false,
                'messages' => [],
            ];
        }

        // 2. Resolve context of the appealed schedule.
        $context = $this->resolveContext($scheduleId);

        if (!$context) {
            return [
                'hasConflicts' => false,
                'messages' => [],
            ];
        }

        // 3. Load effective schedules for the active semester.
        $effectiveSchedules = $this->buildEffectiveSchedules(
            $activeSemester->academic_year_id,
            $activeSemester->semester_id,
            $scheduleId
        );

        // 4. Check program overlap.
        $programConflicts = $this->checkProgramOverlap(
            $effectiveSchedules,
            $context,
            $day,
            $startTime,
            $endTime
        );
        $messages = array_merge($messages, $programConflicts);

        // 5. Check faculty availability.
        $facultyConflicts = $this->checkFacultyAvailability(
            $effectiveSchedules,
            $context,
            $day,
            $startTime,
            $endTime
        );
        $messages = array_merge($messages, $facultyConflicts);

        // 6. Check room availability.
        $roomConflicts = $this->checkRoomAvailability(
            $effectiveSchedules,
            $roomId,
            $day,
            $startTime,
            $endTime
        );
        $messages = array_merge($messages, $roomConflicts);

        return [
            'hasConflicts' => count($messages) > 0,
            'messages' => $messages,
        ];
    }

    /**
     * Resolves the schedule, section, course and semester context.
     *
     * @param int $scheduleId
     * @return object|null
     */
    private function resolveContext(int $scheduleId): ?object
    {
        return DB::table('schedules as s')
            ->join(
                'section_courses as sc',
                's.section_course_id',
                '=',
                'sc.section_course_id'
            )
            ->join(
                'sections_per_program_year as spy',
                'sc.sections_per_program_year_id',
                '=',
                'spy.sections_per_program_year_id'
            )
            ->join('programs as p', 'spy.program_id', '=', 'p.program_id')
            ->leftJoin(
                'course_assignments as ca',
                'sc.course_assignment_id',
                '=',
                'ca.course_assignment_id'
            )
            ->leftJoin(
                'courses as c_ca',
                'ca.course_id',
                '=',
                'c_ca.course_id'
            )
            ->leftJoin(
                'temporary_course_offerings as tco',
                'sc.temporary_course_offering_id',
                '=',
                'tco.temporary_course_offering_id'
            )
            ->leftJoin(
                'courses as c_tco',
                'tco.course_id',
                '=',
                'c_tco.course_id'
            )
            ->where('s.schedule_id', $scheduleId)
            ->select([
                's.schedule_id',
                's.faculty_id',
                'spy.sections_per_program_year_id as section_id',
                'spy.section_name',
                'spy.year_level',
                'p.program_id',
                'p.program_code',
                DB::raw('COALESCE(c_ca.course_id, c_tco.course_id) as course_id'),
                DB::raw('COALESCE(c_ca.course_code, c_tco.course_code)' .
                    ' as course_code'),
                DB::raw('COALESCE(c_ca.course_title, c_tco.course_title)' .
                    ' as course_title'),
            ])
            ->first();
    }

    /**
     * Builds effective active schedules incorporating internal arrangements.
     *
     * @param int $academicYearId
     * @param int $semesterId
     * @param int $excludeScheduleId
     * @return \Illuminate\Support\Collection
     */
    private function buildEffectiveSchedules(
        int $academicYearId,
        int $semesterId,
        int $excludeScheduleId
    ): \Illuminate\Support\Collection {
        return DB::table('schedules as s')
            ->join(
                'section_courses as sc',
                's.section_course_id',
                '=',
                'sc.section_course_id'
            )
            ->join(
                'sections_per_program_year as spy',
                'sc.sections_per_program_year_id',
                '=',
                'spy.sections_per_program_year_id'
            )
            ->leftJoin(
                'course_assignments as ca',
                'sc.course_assignment_id',
                '=',
                'ca.course_assignment_id'
            )
            ->leftJoin(
                'semesters as sem_ca',
                'ca.semester_id',
                '=',
                'sem_ca.semester_id'
            )
            ->leftJoin(
                'temporary_course_offerings as tco',
                'sc.temporary_course_offering_id',
                '=',
                'tco.temporary_course_offering_id'
            )
            ->leftJoin(
                'semesters as sem_tco',
                'tco.semester_id',
                '=',
                'sem_tco.semester_id'
            )
            ->leftJoin(
                'internal_arrangements as ia',
                's.schedule_id',
                '=',
                'ia.schedule_id'
            )
            ->leftJoin('rooms as r_base', 's.room_id', '=', 'r_base.room_id')
            ->leftJoin('rooms as r_arr', 'ia.room_id', '=', 'r_arr.room_id')
            ->leftJoin('faculty as f', 's.faculty_id', '=', 'f.id')
            ->leftJoin('users as u', 'f.user_id', '=', 'u.id')
            ->leftJoin('courses as c_ca', 'ca.course_id', '=', 'c_ca.course_id')
            ->leftJoin(
                'courses as c_tco',
                'tco.course_id',
                '=',
                'c_tco.course_id'
            )
            ->join('programs as p', 'spy.program_id', '=', 'p.program_id')
            ->where('spy.academic_year_id', $academicYearId)
            ->where(function ($query) use ($semesterId) {
                $query->where('sem_ca.semester', $semesterId)
                      ->orWhere('sem_tco.semester', $semesterId);
            })
            ->where('s.schedule_id', '!=', $excludeScheduleId)
            ->select([
                's.schedule_id',
                's.faculty_id',
                'spy.sections_per_program_year_id as section_id',
                'spy.section_name',
                'spy.year_level',
                'p.program_code',
                DB::raw('COALESCE(c_ca.course_code, c_tco.course_code)' .
                    ' as course_code'),
                DB::raw('COALESCE(c_ca.course_title, c_tco.course_title)' .
                    ' as course_title'),
                DB::raw('CONCAT(u.first_name, " ", u.last_name)' .
                    ' as professor_name'),
                DB::raw('COALESCE(ia.day, s.day) as effective_day'),
                DB::raw('COALESCE(ia.start_time, s.start_time)' .
                    ' as effective_start_time'),
                DB::raw('COALESCE(ia.end_time, s.end_time)' .
                    ' as effective_end_time'),
                DB::raw('COALESCE(ia.room_id, s.room_id) as effective_room_id'),
                DB::raw('COALESCE(r_arr.room_code, r_base.room_code)' .
                    ' as effective_room_code'),
            ])
            ->get();
    }

    /**
     * Validates program time overlaps.
     *
     * @param \Illuminate\Support\Collection $effective
     * @param object $context
     * @param string $day
     * @param string $start
     * @param string $end
     * @return array
     */
    private function checkProgramOverlap(
        \Illuminate\Support\Collection $effective,
        object $context,
        string $day,
        string $start,
        string $end
    ): array {
        $messages = [];

        foreach ($effective as $s) {
            if ($s->section_id == $context->section_id &&
                $s->effective_day == $day &&
                $s->effective_start_time &&
                $s->effective_end_time &&
                $this->doTimesOverlap(
                    $start,
                    $end,
                    $s->effective_start_time,
                    $s->effective_end_time
                )
            ) {
                $startDisp = $this->formatTime($s->effective_start_time);
                $endDisp = $this->formatTime($s->effective_end_time);

                $messages[] = "This section is already scheduled for " .
                    "another class on {$day} from {$startDisp} " .
                    "to {$endDisp}.";
            }
        }

        return $messages;
    }

    /**
     * Validates faculty availability against schedule.
     *
     * @param \Illuminate\Support\Collection $effective
     * @param object $context
     * @param string $day
     * @param string $start
     * @param string $end
     * @return array
     */
    private function checkFacultyAvailability(
        \Illuminate\Support\Collection $effective,
        object $context,
        string $day,
        string $start,
        string $end
    ): array {
        $messages = [];

        if (!$context->faculty_id) {
            return $messages;
        }

        foreach ($effective as $s) {
            if ($s->faculty_id == $context->faculty_id &&
                $s->effective_day == $day &&
                $s->effective_start_time &&
                $s->effective_end_time &&
                $this->doTimesOverlap(
                    $start,
                    $end,
                    $s->effective_start_time,
                    $s->effective_end_time
                )
            ) {
                $startDisp = $this->formatTime($s->effective_start_time);
                $endDisp = $this->formatTime($s->effective_end_time);

                $messages[] = "You are already assigned to another class " .
                    "({$s->course_code} - {$s->course_title}) on {$day} " .
                    "from {$startDisp} to {$endDisp}.";
            }
        }

        return $messages;
    }

    /**
     * Validates room booking conflicts.
     *
     * @param \Illuminate\Support\Collection $effective
     * @param int|null $roomId
     * @param string $day
     * @param string $start
     * @param string $end
     * @return array
     */
    private function checkRoomAvailability(
        \Illuminate\Support\Collection $effective,
        ?int $roomId,
        string $day,
        string $start,
        string $end
    ): array {
        $messages = [];

        if (!$roomId) {
            return $messages;
        }

        $roomCode = DB::table('rooms')
            ->where('room_id', $roomId)
            ->value('room_code') ?? 'Unknown';

        foreach ($effective as $s) {
            if ($s->effective_room_id == $roomId &&
                $s->effective_day == $day &&
                $s->effective_start_time &&
                $s->effective_end_time &&
                $this->doTimesOverlap(
                    $start,
                    $end,
                    $s->effective_start_time,
                    $s->effective_end_time
                )
            ) {
                $startDisp = $this->formatTime($s->effective_start_time);
                $endDisp = $this->formatTime($s->effective_end_time);

                $messages[] = "Room {$roomCode} is already booked for " .
                    "another course on {$day} from {$startDisp} " .
                    "to {$endDisp}.";
            }
        }

        return $messages;
    }

    /**
     * Checks if two time ranges overlap.
     *
     * @param string $start1
     * @param string $end1
     * @param string $start2
     * @param string $end2
     * @return bool
     */
    private function doTimesOverlap(
        string $start1,
        string $end1,
        string $start2,
        string $end2
    ): bool {
        $s1 = $this->timeToMinutes($start1);
        $e1 = $this->timeToMinutes($end1);
        $s2 = $this->timeToMinutes($start2);
        $e2 = $this->timeToMinutes($end2);

        return $s1 < $e2 && $e1 > $s2;
    }

    /**
     * Converts a time string to minutes.
     *
     * @param string $time
     * @return int
     */
    private function timeToMinutes(string $time): int
    {
        $parts = explode(':', $time);
        $hours = (int) ($parts[0] ?? 0);
        $minutes = (int) ($parts[1] ?? 0);
        return $hours * 60 + $minutes;
    }

    /**
     * Formats a time string to a human-readable 12-hour format.
     *
     * @param string $time
     * @return string
     */
    private function formatTime(string $time): string
    {
        return date("g:i A", strtotime($time));
    }
}
