<?php

namespace App\Http\Controllers;

use App\Services\GeminiService;
use App\Models\Appeal;
use App\Models\Room;
use App\Models\Schedule;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RescheduleController extends Controller
{
    // ─────────────────────────────────────────────────────────
    //  FACULTY — Submit an appeal
    //  POST /api/rescheduling-appeals
    // ─────────────────────────────────────────────────────────
    public function submitReschedulingAppeal(Request $request): JsonResponse
    {
        // Temporary fix for "headers already sent" error
        // TODO: Fix file handling to avoid this hack
        while (ob_get_level() > 0) { @ob_end_clean(); }
        @ini_set('display_errors', '0');
        error_reporting(E_ALL & ~E_NOTICE & ~E_WARNING);

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

        $schedule = Schedule::with(['room'])
            ->join('rooms as r', 'schedules.room_id', '=', 'r.room_id')
            ->where('schedules.schedule_id', $validated['scheduleId'])
            ->select('schedules.*', 'r.room_code as room_code')
            ->first();

        $filePath = null;
        $aiSummary = null;

        if ($request->hasFile('appealFile')) {
            $file = $request->file('appealFile');
            
            // 1. Store the file in storage/app/public/appeals
            $filePath = $file->store('appeals', 'public');
            
            // 2. Get the absolute path to the permanently saved file
            $absolutePath = storage_path('app/public/' . $filePath);
            
            // 3. Send the absolute path to Gemini
            $aiSummary = GeminiService::summarizeAppealDocument($absolutePath);
        }
        
        $roomId = null;
        if (!empty($validated['roomCode'])) {
            $room   = Room::where('room_code', $validated['roomCode'])->first();
            $roomId = $room?->room_id;
        }

        // 🟢 CHANGE #2: Combine the typed reason and the AI summary
        $finalReasoning = $validated['reason'];
        if ($aiSummary) {
            $finalReasoning .= "\n\n--- AI DOCUMENT SUMMARY ---\n" . trim($aiSummary);
        }

        // 🟢 CHANGE #3: Save the combined $finalReasoning to the database
        $appeal = Appeal::create([
            'schedule_id' => $validated['scheduleId'],
            'day'         => $validated['day'],
            'start_time'  => $validated['startTime'],
            'end_time'    => $validated['endTime'],
            'room_id'     => $roomId,
            'file_path'   => $filePath,
            'reasoning'   => $finalReasoning, // Updated this line!
            'is_approved' => null,
        ]);

        return response()->json(['message' => 'Appeal submitted successfully.', 'appeal' => $appeal], 201);
    }
    
    // ─────────────────────────────────────────────────────────
    //  FACULTY — Get my own appeals
    //  GET /api/my-appeals
    // ─────────────────────────────────────────────────────────
    public function getMyAppeals(Request $request)
    {
        $user = $request->user();
        
        $faculty = DB::table('faculty')->where('user_id', $user->id)->first();

        if (!$faculty) {
            return response()->json([], 200);
        }

        $appeals = DB::table('appeals')
            ->join('schedules', 'appeals.schedule_id', '=', 'schedules.schedule_id')
            ->leftJoin('rooms as orig_room', 'schedules.room_id', '=', 'orig_room.room_id')
            ->leftJoin('rooms as appeal_room', 'appeals.room_id', '=', 'appeal_room.room_id')
            ->where('schedules.faculty_id', $faculty->id)
            ->select(
                'appeals.*',
                'schedules.day as original_day',
                'schedules.start_time as original_start_time',
                'schedules.end_time as original_end_time',
                'orig_room.room_code as original_room_code',
                'appeal_room.room_code as appeal_room_code'
            )
            ->orderBy('appeals.created_at', 'desc')
            ->get();

        $formattedAppeals = $appeals->map(function ($appeal) {
            return [
                'appeal_id'           => $appeal->appeal_id,
                'schedule_id'         => $appeal->schedule_id,
                
                // Dynamically pulled from the official schedules table
                'original_day'        => $appeal->original_day,
                'original_start_time' => $appeal->original_start_time,
                'original_end_time'   => $appeal->original_end_time,
                'original_room'       => $appeal->original_room_code, 

                // The requested appeal changes
                'appeal_day'          => $appeal->day,
                'appeal_start_time'   => $appeal->start_time,
                'appeal_end_time'     => $appeal->end_time,
                'appeal_room'         => $appeal->appeal_room_code,
                
                'reasoning'           => $appeal->reasoning,
                'file_path'           => $appeal->file_path,
                'is_approved'         => $appeal->is_approved,
                'admin_remarks'       => $appeal->admin_remarks,
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
            ->join('schedules as s',          'a.schedule_id',                   '=', 's.schedule_id')
            ->join('section_courses as sc',   's.section_course_id',             '=', 'sc.section_course_id')
            ->join('course_assignments as ca','sc.course_assignment_id',         '=', 'ca.course_assignment_id')
            ->join('courses as c',            'ca.course_id',                    '=', 'c.course_id')
            ->join('sections_per_program_year as spy', 'sc.sections_per_program_year_id', '=', 'spy.sections_per_program_year_id')
            ->join('programs as p',           'spy.program_id',                  '=', 'p.program_id')
            ->join('faculty as f',            's.faculty_id',                    '=', 'f.id')
            ->join('users as u',              'f.user_id',                       '=', 'u.id')
            ->leftJoin('rooms as orig_r',     's.room_id',                       '=', 'orig_r.room_id') // Join original room
            ->leftJoin('rooms as ar',         'a.room_id',                       '=', 'ar.room_id')     // Join appeal room
            ->select([
                'a.appeal_id',
                'a.schedule_id',
                DB::raw("CONCAT(u.last_name, ', ', u.first_name, ' ', COALESCE(u.middle_name, '')) AS faculty_name"),
                'p.program_code',
                'c.course_title',
                // Original schedule data from schedules table
                's.day              AS original_day',
                's.start_time       AS original_start_time',
                's.end_time         AS original_end_time',
                'orig_r.room_code   AS original_room',
                // Appeal data
                'a.day              AS appeal_day',
                'a.start_time       AS appeal_start_time',
                'a.end_time         AS appeal_end_time',
                'ar.room_code       AS appeal_room',
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
        try {
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
            $oldAppealData = $appeal->toArray();

            $schedule = Schedule::findOrFail($appeal->schedule_id);
            $oldScheduleData = $schedule->toArray();

            $roomId = $appeal->room_id;
            if (!empty($validated['room'])) {
                $room   = Room::where('room_code', $validated['room'])->first();
                $roomId = $room?->room_id ?? $roomId;
            }

            DB::transaction(function () use ($appeal, $schedule, $validated, $roomId) {
                // 1. Actually update the appeal to Approved
                $appeal->update([
                    'is_approved'   => 1,
                    'admin_remarks' => $validated['admin_remarks'] ?? null,
                    'day'           => $validated['day'],
                    'start_time'    => $validated['start_time'],
                    'end_time'      => $validated['end_time'],
                    'room_id'       => $roomId,
                ]);

                // 2. Create the internal arrangement
                $arrangement = \App\Models\InternalArrangement::updateOrCreate(
                    ['schedule_id' => $schedule->schedule_id],
                    [
                        'appeal_id'  => $appeal->appeal_id,
                        'day'        => $validated['day'],
                        'start_time' => $validated['start_time'],
                        'end_time'   => $validated['end_time'],
                        'room_id'    => $roomId,
                    ]
                );

                // 3. Log the arrangement
                AuditLogger::logUpdate(
                    model: 'InternalArrangement',
                    modelId: $arrangement->arrangement_id,
                    oldData: [],
                    newData: $arrangement->toArray(),
                    description: "Approved appeal #{$appeal->appeal_id} and created internal arrangement for Schedule #{$schedule->schedule_id}"
                );
            });

            // ═══════════════════════════════════════════════════════
            // AUDIT LOG: Appeal Approved and Schedule Updated
            // ═══════════════════════════════════════════════════════
            AuditLogger::logUpdate(
                model: 'Appeal',
                modelId: $appeal->appeal_id,
                oldData: $oldAppealData,
                newData: $appeal->toArray(),
                description: "Approved Appeal #{$appeal->appeal_id}"
            );

            AuditLogger::logUpdate(
                model: 'Schedule',
                modelId: $schedule->schedule_id,
                oldData: $oldScheduleData,
                newData: $schedule->toArray(),
                description: "Rescheduled via Appeal: Moved Schedule #{$schedule->schedule_id} to {$validated['day']} ({$validated['start_time']} - {$validated['end_time']})"
            );

            return response()->json([
                'message' => 'Appeal submitted successfully.',
                'appeal'  => $appeal,
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to approve appeal: ' . $e->getMessage(),
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // ─────────────────────────────────────────────────────────
    //  ADMIN — Deny an appeal
    //  POST /api/rescheduling-appeals/{id}/deny
    // ─────────────────────────────────────────────────────────
    public function denyAppeal(Request $request, int $id): JsonResponse
    {
        try {
            $validated = $request->validate([
                'admin_remarks' => 'nullable|string',
            ]);

            $appeal = Appeal::findOrFail($id);

            $appeal->update([
                'is_approved'   => 0,                             
                'admin_remarks' => $validated['admin_remarks'] ?? null,
            ]);

            return response()->json(['message' => 'Appeal denied.', 'appeal' => $appeal->fresh()]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to deny appeal: ' . $e->getMessage(),
                'error' => $e->getMessage()
            ], 500);
        }
    }
}