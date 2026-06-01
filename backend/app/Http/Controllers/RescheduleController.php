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
use App\Mail\AppealAccessRequested;
use App\Mail\AppealAccessApproved;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Log;

class RescheduleController extends Controller
{
    // ─────────────────────────────────────────────────────────
    //  FACULTY — Submit an appeal
    //  POST /api/rescheduling-appeals
    // ─────────────────────────────────────────────────────────
    
    /**
     * Submit a rescheduling appeal for a faculty schedule.
     *
     * @param Request $request Contains scheduleId, reason, day,
     *                          startTime, endTime, roomCode,
     *                          and optional appealFile
     * @return JsonResponse Appeal confirmation or validation error
     */
    public function submitReschedulingAppeal(Request $request): JsonResponse
    {
        while (ob_get_level() > 0) { @ob_end_clean(); }
        @ini_set('display_errors', '0');
        error_reporting(E_ALL & ~E_NOTICE & ~E_WARNING);

        $validated = $request->validate([
            'scheduleId' => 'required|integer|exists:schedules,schedule_id',
            'reason'     => 'required|string',
            'day'        => 'required|in:Monday,Tuesday,Wednesday,'
                            . 'Thursday,Friday,Saturday,Sunday',
            'startTime'  => ['required', 'date_format:H:i'],
            'endTime'    => ['required', 'date_format:H:i'],
            'roomCode'   => 'nullable|string',
            'appealFile' => 'nullable|file|mimes:pdf|max:5120',
        ]);

        if (strtotime($validated['endTime']) <= strtotime($validated['startTime'])) {
            return response()->json(
                ['message' => 'The end time must be after the start time.'],
                422
            );
        }

        $user = $request->user();
        $faculty = DB::table('faculty')->where('user_id', $user->id)->first();

        if (!$faculty) {
            return response()->json(
                ['message' => 'Unauthorized. Faculty profile not found.'],
                403
            );
        }

        $schedule = Schedule::findOrFail($validated['scheduleId']);
        
        if ($schedule->faculty_id !== $faculty->id) {
            return response()->json(
                ['message' => 'Forbidden. You are not authorized to '
                              . 'appeal this schedule.'],
                403
            );
        }

        $filePath = null;
        $aiSummary = null;

        if ($request->hasFile('appealFile')) {
            $file = $request->file('appealFile');

            // --- VIRUS SCAN START ---
            $apiKey = config('services.cloudmersive.api_key');
            
            if ($apiKey) {
                $scanResponse = Http::withHeaders(
                    ['Apikey' => $apiKey]
                )
                    ->attach(
                        'inputFile',
                        file_get_contents($file->getRealPath()),
                        $file->getClientOriginalName()
                    )
                    ->post('https://api.cloudmersive.com/virus/scan/file');

                Log::info('Virus scan response: ' . $scanResponse->body());

                if ($scanResponse->successful()) {
                    $scanResult = $scanResponse->json();
                    
                    if (isset($scanResult['CleanResult'])
                        && $scanResult['CleanResult'] === false) {
                        throw ValidationException::withMessages([
                            'appealFile' => 'Security alert: Malicious '
                                          . 'content detected. Upload blocked.',
                        ]);
                    }
                } else {
                    return response()->json(
                        ['message' => 'Security scan service unavailable. '
                                    . 'Try again later.'],
                        503
                    );
                }
            }
            // --- VIRUS SCAN END ---

            // File is clean, proceed with storage
            $filePath = $file->store('appeals', 'public');
            $absolutePath = storage_path('app/public/' . $filePath);
            $aiSummary = GeminiService::summarizeAppealDocument(
                $absolutePath
            );
        }
        
        $roomId = null;
        if (!empty($validated['roomCode'])) {
            $room   = Room::where('room_code', $validated['roomCode'])->first();
            $roomId = $room?->room_id;
        }

        $finalReasoning = $validated['reason'];
        if ($aiSummary) {
            $finalReasoning .= "\n\n--- AI DOCUMENT SUMMARY ---\n" . 
              trim($aiSummary);
        }

        $existing = Appeal::where('schedule_id', $validated['scheduleId'])
            ->whereNull('is_approved')
            ->first();

        if ($existing) {
            return response()->json(
                ['message' => 'You already have a pending appeal for this schedule.'],
                422
            );
        }

        $appeal = Appeal::create([
            'schedule_id'         => $validated['scheduleId'],
            'original_day'        => $schedule->day,
            'original_start_time' => $schedule->start_time,
            'original_end_time'   => $schedule->end_time,
            'original_room_id'    => $schedule->room_id,
            'day'                 => $validated['day'],
            'start_time'          => $validated['startTime'],
            'end_time'            => $validated['endTime'],
            'room_id'             => $roomId,
            'file_path'           => $filePath,
            'reasoning'           => $finalReasoning, 
            'is_approved'         => null,
        ]);

        return response()->json(
            ['message' => 'Appeal submitted successfully.', 'appeal' => $appeal],
            201
        );
    }

    // ─────────────────────────────────────────────────────────
    //  FACULTY — Get my own appeals
    //  GET /api/my-appeals
    // ─────────────────────────────────────────────────────────
    
    /**
     * Retrieve all appeals submitted by the authenticated faculty.
     *
     * @param Request $request The incoming HTTP request
     * @return JsonResponse List of appeals with original and requested
     *                       schedule details
     */
    public function getMyAppeals(Request $request)
    {
        $user = $request->user();
        
        $faculty = DB::table('faculty')->where('user_id', $user->id)->first();

        if (!$faculty) {
            return response()->json([], 200);
        }

        $appeals = DB::table('appeals')
            ->join('schedules', 'appeals.schedule_id', '=',
                   'schedules.schedule_id')
            ->leftJoin('rooms as orig_room', 'schedules.room_id', '=',
                       'orig_room.room_id')
            ->leftJoin('rooms as appeal_room', 'appeals.room_id', '=',
                       'appeal_room.room_id')
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
                
                // Dynamically pulled from official schedules table
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
    
    /**
     * Cancel a pending appeal submitted by the authenticated faculty.
     *
     * @param Request $request The incoming HTTP request
     * @param int     $id      The appeal ID to cancel
     * @return JsonResponse Success message or authorization error
     */
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
            return response()->json([
              'message' => 'Only pending appeals can be cancelled.'
            ], 422);
        }

        $appeal->delete();

        return response()->json(['message' => 'Appeal cancelled successfully.']);
    }

    // ─────────────────────────────────────────────────────────
    //  ADMIN — Fetch all appeals
    //  GET /api/rescheduling-appeals
    // ─────────────────────────────────────────────────────────
    
    /**
     * Retrieve all rescheduling appeals with complete details.
     *
     * Fetches appeal records joined with schedule, course, section,
     * program, and faculty information for admin review.
     *
     * @return JsonResponse List of all appeals with related data
     */
    public function getAllAppeals(): JsonResponse
    {
        $appeals = DB::table('appeals as a')
            ->join('schedules as s', 'a.schedule_id', '=', 's.schedule_id')
            ->join('section_courses as sc', 's.section_course_id', '=',
                'sc.section_course_id')
            ->leftJoin('course_assignments as ca',
                'sc.course_assignment_id', '=',
                'ca.course_assignment_id')
            ->leftJoin('courses as c', 'ca.course_id', '=', 'c.course_id')
            ->join('sections_per_program_year as spy',
                'sc.sections_per_program_year_id', '=',
                'spy.sections_per_program_year_id')
            ->join('programs as p', 'spy.program_id', '=',
                'p.program_id')
            ->join('faculty as f', 's.faculty_id', '=', 'f.id')
            ->join('users as u', 'f.user_id', '=', 'u.id')
            ->leftJoin('rooms as orig_r', 's.room_id', '=', 'orig_r.room_id')
            ->leftJoin('rooms as ar', 'a.room_id', '=', 'ar.room_id')
            ->select([
                'a.appeal_id',
                'a.schedule_id',
                DB::raw("CONCAT(u.last_name, ', ', u.first_name, ' ', "
                        . "COALESCE(u.middle_name, '')) AS faculty_name"),
                'p.program_code',
                'c.course_title',
                's.day              AS original_day',
                's.start_time       AS original_start_time',
                's.end_time         AS original_end_time',
                'orig_r.room_code   AS original_room',
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
                description: "Rescheduled via Appeal:" .
                    "Moved Schedule #{$schedule->schedule_id} to " .
                    "{$validated['day']} ({$validated['start_time']} - {$validated['end_time']})"
            );

            return response()->json([
                'message' => 'Appeal submitted successfully.',
                'appeal'  => $appeal,
            ], 201);
        } catch (\Exception $e) {
            Log::warning('Failed to approve appeal: ' . $e->getMessage(), ['exception' => $e]);
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
            Log::warning('Failed to deny appeal: ' . $e->getMessage(), ['exception' => $e]);
            return response()->json([
                'message' => 'Failed to deny appeal: ' . $e->getMessage(),
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // ─────────────────────────────────────────────────────────
    //  ADMIN / FACULTY — Appeal Access Toggles & Requests
    // ─────────────────────────────────────────────────────────

    public function toggleFacultyAppealAccess(Request $request): JsonResponse
    {
        try {
            $request->validate([
                'faculty_id' => 'required|exists:faculty,id',
                'is_enabled' => 'required|boolean',
                'start_date' => 'nullable|date',
                'end_date'   => 'nullable|date',
                'send_email' => 'nullable|boolean'
            ]);

            $faculty = \App\Models\Faculty::with('user')->findOrFail($request->input('faculty_id'));

            $faculty->update([
                'is_appeal_enabled'  => $request->input('is_enabled'),
                'has_appeal_request' => 0,
                'appeal_start_date'  => $request->input('is_enabled') ? $request->input('start_date') : null,
                'appeal_end_date'    => $request->input('is_enabled') ? $request->input('end_date') : null,
            ]);

            // Send Email if turning ON and requested
            if ($request->input('is_enabled') && $request->input('send_email') && $faculty->user && $faculty->user->email) {
                \Illuminate\Support\Facades\Mail::to($faculty->user->email)->send(new \App\Mail\AppealAccessApproved(
                    $faculty->user->first_name,
                    $request->input('start_date'),
                    $request->input('end_date')
                ));
            }

            return response()->json(['message' => 'Appeal access updated successfully']);

        } catch (\Exception $e) {
            // This logs the exact crash reason to storage/logs/laravel.log
            Log::error('Toggle Appeal Error: ' . $e->getMessage(), ['exception' => $e]);
            
            // This sends the exact crash reason back to your browser console!
            return response()->json([
                'message' => 'Server Error: ' . $e->getMessage(),
                'line' => $e->getLine(),
                'file' => $e->getFile()
            ], 500);
        }
    }

    // ─────────────────────────────────────────────────────────
    //  ADMIN — Reject an Appeal Access Request (From Overview)
    // ─────────────────────────────────────────────────────────
    public function rejectAppealAccessRequest(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'faculty_id' => 'required|exists:faculty,id'
        ]);

        $faculty = \App\Models\Faculty::with('user')->findOrFail($validated['faculty_id']);
        
        // Remove the orange badge
        $faculty->update(['has_appeal_request' => 0]);

        // Send Rejection Email gracefully
        try {
            if ($faculty->user && $faculty->user->email) {
                \Illuminate\Support\Facades\Mail::to($faculty->user->email)
                    ->send(new \App\Mail\AppealAccessDenied($faculty->user->first_name));
            }
        } catch (\Throwable $e) {
            // If the email fails (or class is missing), I catch the error, log it, and prevent the 500 crash.
            Log::error('Failed to send rejection email: ' . $e->getMessage(), ['exception' => $e]);
            return response()->json([
                'message' => 'Appeal request denied, but the email failed to send.'
            ], 200); 
        }

        return response()->json(['message' => 'Appeal request denied and email sent.']);
    }

    // ─────────────────────────────────────────────────────────
    //  ADMIN — Toggle All Appeal Access (With Email Option)
    // ─────────────────────────────────────────────────────────
    public function toggleAllFacultyAppealAccess(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'is_enabled'         => 'required|boolean',
            'active_semester_id' => 'required|integer',
            'start_date'         => 'nullable|date',
            'end_date'           => 'nullable|date',
            'send_email'         => 'nullable|boolean'
        ]);

        $isEnabled = $validated['is_enabled'];

        DB::table('faculty')->update([
            'is_appeal_enabled'  => $isEnabled,
            'has_appeal_request' => $isEnabled ? 0 : DB::raw('has_appeal_request'),
            'appeal_start_date'  => $isEnabled ? ($validated['start_date'] ?? null) : null,
            'appeal_end_date'    => $isEnabled ? ($validated['end_date'] ?? null) : null,
        ]);

        // If toggled ON and admin checked the email box, send to everyone
        if ($isEnabled && !empty($validated['send_email'])) {
            $users = \App\Models\User::where('status', 'Active')->whereHas('faculty')->get();
                
            foreach ($users as $user) {
                if ($user->email) {
                    \Illuminate\Support\Facades\Mail::to($user->email)->send(new \App\Mail\AppealAccessApproved(
                        $user->first_name,
                        $validated['start_date'] ?? null,
                        $validated['end_date'] ?? null
                    ));
                }
            }
        }

        return response()->json(['message' => 'All faculty appeal access updated.']);
    }

    public function requestAppealAccess(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $faculty = \App\Models\Faculty::where('user_id', $user->id)->first();

        if (!$faculty) {
            return response()->json(['message' => 'Faculty profile not found.'], 404);
        }

        $faculty->update(['has_appeal_request' => 1]);

        $fName = $user->first_name ?? 'Faculty';
        $lName = $user->last_name ?? '';

        try {
            \Illuminate\Support\Facades\Mail::to('pupt.flss2027@gmail.com')
                ->send(new \App\Mail\AppealAccessRequested($fName, $lName));
        } catch (\Throwable $e) {
            Log::error('Failed to send appeal request email: ' . $e->getMessage(), ['exception' => $e]);
            // Still return success since the DB was updated — email is secondary
            return response()->json(['message' => 'Appeal request sent successfully (email delivery failed).']);
        }

        return response()->json(['message' => 'Appeal request sent successfully']);
    }

    public function cancelAppealAccessRequest(Request $request): JsonResponse
    {
        $user = $request->user();
        $faculty = \App\Models\Faculty::where('user_id', $user->id)->firstOrFail();

        $faculty->update(['has_appeal_request' => 0]);

        return response()->json(['message' => 'Appeal request cancelled']);
    }

    // ─────────────────────────────────────────────────────────
    //  ADMIN / FACULTY — Download Appeal Document
    // ─────────────────────────────────────────────────────────
    public function downloadAppealDocument(int $id)
    {
        $appeal = \App\Models\Appeal::findOrFail($id);

        if (!$appeal->file_path) {
            return response()->json(['message' => 'No document attached to this appeal.'], 404);
        }

        $path = storage_path('app/public/' . $appeal->file_path);

        if (!file_exists($path)) {
            return response()->json(['message' => 'File not found on server.'], 404);
        }

        // response()->download() forces the browser to save the file
        return response()->download($path);
    }
}