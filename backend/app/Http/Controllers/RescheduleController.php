<?php

namespace App\Http\Controllers;

use App\Models\Appeal;
use App\Models\Room;
use App\Models\Schedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RescheduleController extends Controller
{
    // ─────────────────────────────────────────────────────────
    //  FACULTY — Submit an appeal
    //  POST /api/submit-rescheduling-appeal
    // ─────────────────────────────────────────────────────────
    public function submitReschedulingAppeal(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'scheduleId' => 'required|integer|exists:schedules,schedule_id',
            'reason'     => 'required|string',
            'day'        => 'required|in:Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
            'startTime'  => ['required', 'date_format:H:i'],
            'endTime'    => ['required', 'date_format:H:i'],
            'roomCode'   => 'nullable|string',
            'appealFile' => 'nullable|file|mimes:pdf|max:5120',
        ]);

        if (strtotime($validated['endTime']) <= strtotime($validated['startTime'])) {
            return response()->json(['message' => 'The end time must be after the start time.'], 422);
        }

        // Snapshot the original schedule at submission time
        $schedule = Schedule::with(['room'])
            ->join('rooms as r', 'schedules.room_id', '=', 'r.room_id')
            ->where('schedules.schedule_id', $validated['scheduleId'])
            ->select('schedules.*', 'r.room_code as room_code')
            ->first();

        $filePath = null;
        if ($request->hasFile('appealFile')) {
            $filePath = $request->file('appealFile')->store('appeals', 'public');
        }

        $roomId = null;
        if (!empty($validated['roomCode'])) {
            $room   = Room::where('room_code', $validated['roomCode'])->first();
            $roomId = $room?->room_id;
        }

        $appeal = Appeal::create([
            'schedule_id'         => $validated['scheduleId'],
            'original_day'        => $schedule?->day,
            'original_start_time' => $schedule?->start_time,
            'original_end_time'   => $schedule?->end_time,
            'original_room_code'  => $schedule?->room_code,
            'day'                 => $validated['day'],
            'start_time'          => $validated['startTime'],
            'end_time'            => $validated['endTime'],
            'room_id'             => $roomId,
            'file_path'           => $filePath,
            'reasoning'           => $validated['reason'],
            'is_approved'         => null,
        ]);

        return response()->json(['message' => 'Appeal submitted successfully.', 'appeal' => $appeal], 201);
    }

    // ─────────────────────────────────────────────────────────
    //  FACULTY — Get my own appeals
    //  GET /api/my-appeals
    // ─────────────────────────────────────────────────────────
    public function getMyAppeals(Request $request)
    {
        // Fetch appeals AND eagerly load the linked schedule to prevent slow queries
        $schedules = DB::table('schedules')
            ->where('faculty_id', $request->user()->id)
            ->get();
        $appeals = DB::table('appeals')->whereIn('schedule_id', $schedules)->get();

        // Map the data so the frontend still gets the 'original' fields it expects
        $formattedAppeals = $appeals->map(function ($appeal) {
            return [
                'appeal_id'           => $appeal->id,
                'schedule_id'         => $appeal->schedule_id,
                
                // Fetch dynamically from the relation instead of the appeals table!
                'original_day'        => $schedules->day,
                'original_start_time' => $schedules->start_time,
                'original_end_time'   => $schedules->end_time,
                // (Adjust the room fetch based on how your schedule table stores it)
                'original_room'       => $schedules->room_id, 

                'appeal_day'          => $appeal->day,
                'appeal_start_time'   => $appeal->start_time,
                'appeal_end_time'     => $appeal->end_time,
                'appeal_room'         => $appeal->room,
                'reasoning'           => $appeal->reason,
                'file_path'           => $appeal->file_path,
                'is_approved'         => $appeal->is_approved,
                'created_at'          => $appeal->created_at,
            ];
        });

        return response()->json($formattedAppeals);
    }

    // ─────────────────────────────────────────────────────────
    //  FACULTY — Cancel a pending appeal
    //  DELETE /api/my-appeals/{id}
    // ─────────────────────────────────────────────────────────
    public function cancelAppeal(Request $request, int $id): JsonResponse
    {
        $user    = $request->user();
        $faculty = DB::table('faculty')->where('user_id', $user->id)->first();

        $appeal = Appeal::findOrFail($id);

        $schedule = DB::table('schedules')
            ->where('schedule_id', $appeal->schedule_id)
            ->where('faculty_id', $faculty->id)
            ->first();

        if (!$schedule) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        if ($appeal->is_approved !== null) {
            return response()->json(['message' => 'Only pending appeals can be cancelled.'], 422);
        }

        $appeal->delete();

        return response()->json(['message' => 'Appeal cancelled successfully.']);
    }

    // ─────────────────────────────────────────────────────────
    //  ADMIN — Fetch all appeals
    //  GET /api/rescheduling-appeals
    // ─────────────────────────────────────────────────────────
    public function getAllAppeals(): JsonResponse
    {
        $appeals = DB::table('appeals as a')
            ->join('schedules as s',          'a.schedule_id',                    '=', 's.schedule_id')
            ->join('section_courses as sc',   's.section_course_id',              '=', 'sc.section_course_id')
            ->join('course_assignments as ca','sc.course_assignment_id',           '=', 'ca.course_assignment_id')
            ->join('courses as c',            'ca.course_id',                     '=', 'c.course_id')
            ->join('sections_per_program_year as spy', 'sc.sections_per_program_year_id', '=', 'spy.sections_per_program_year_id')
            ->join('programs as p',           'spy.program_id',                   '=', 'p.program_id')
            ->join('faculty as f',            's.faculty_id',                     '=', 'f.id')
            ->join('users as u',              'f.user_id',                        '=', 'u.id')
            ->leftJoin('rooms as ar',         'a.room_id',                        '=', 'ar.room_id')
            ->select([
                'a.appeal_id',
                'a.schedule_id',
                DB::raw("CONCAT(u.last_name, ', ', u.first_name, ' ', COALESCE(u.middle_name, '')) AS faculty_name"),
                'p.program_code',
                'c.course_title',
                'a.original_day        AS original_day',
                'a.original_start_time AS original_start_time',
                'a.original_end_time   AS original_end_time',
                'a.original_room_code  AS original_room',
                'a.day        AS appeal_day',
                'a.start_time AS appeal_start_time',
                'a.end_time   AS appeal_end_time',
                'ar.room_code AS appeal_room',
                'a.file_path',
                'a.reasoning',
                'a.is_approved',
                'a.created_at',
            ])
            ->orderBy('a.created_at', 'desc')
            ->get();

        return response()->json($appeals);
    }

    // ─────────────────────────────────────────────────────────
    //  ADMIN — Approve an appeal
    //  POST /api/rescheduling-appeals/{id}/approve
    // ─────────────────────────────────────────────────────────
    public function approveAppeal(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'day'           => 'required|in:Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
            'start_time'    => ['required', 'date_format:H:i'],
            'end_time'      => ['required', 'date_format:H:i'],
            'room'          => 'nullable|string',
            'admin_remarks' => 'nullable|string',
        ]);

        if (strtotime($validated['end_time']) <= strtotime($validated['start_time'])) {
            return response()->json(['message' => 'The end time must be after the start time.'], 422);
        }

        $appeal = Appeal::findOrFail($id);

        $roomId = $appeal->room_id;
        if (!empty($validated['room'])) {
            $room   = Room::where('room_code', $validated['room'])->first();
            $roomId = $room?->room_id ?? $roomId;
        }

        DB::transaction(function () use ($appeal, $validated, $roomId) {
            $appeal->update([
                'is_approved' => 1,
                'admin_remarks' => $validated['admin_remarks'] ?? null,
                'day'         => $validated['day'],
                'start_time'  => $validated['start_time'],
                'end_time'    => $validated['end_time'],
                'room_id'     => $roomId,
            ]);

            Schedule::where('schedule_id', $appeal->schedule_id)
                ->update([
                    'day'        => $validated['day'],
                    'start_time' => $validated['start_time'],
                    'end_time'   => $validated['end_time'],
                    'room_id'    => $roomId,
                ]);
        });

        return response()->json(['message' => 'Appeal approved and schedule updated.', 'appeal' => $appeal->fresh()]);
    }

    // ─────────────────────────────────────────────────────────
    //  ADMIN — Deny an appeal
    //  POST /api/rescheduling-appeals/{id}/deny
    // ─────────────────────────────────────────────────────────
    public function denyAppeal(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'admin_remarks' => 'nullable|string',
        ]);

        $appeal = Appeal::findOrFail($id);

        $appeal->update([
            'is_approved'   => 0,                           
            'admin_remarks' => $validated['admin_remarks'] ?? null,
        ]);

        return response()->json(['message' => 'Appeal denied.', 'appeal' => $appeal->fresh()]);
    }
}