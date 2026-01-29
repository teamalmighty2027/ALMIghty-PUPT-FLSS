<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

class RescheduleController extends Controller
{
    /**
     * Accepts a rescheduling appeal POST and inserts a record into the `appeals` table.
     *
     * Expects payload keys (either top-level or under `appealSchedule`):
     *  - schedule_id (optional)
     *  - appealSchedule.day or day
     *  - appealSchedule.startTime or startTime
     *  - appealSchedule.endTime or endTime
     *  - appealSchedule.room or room (room code)
     *  - reason or reasoning
     *  - appealFile (multipart file upload) - optional
     */
    public function submitReschedulingAppeal(Request $request)
    {
        // Normalize inputs (support both nested and top-level)
        $input = array_merge(
            $request->all(),
            $request->input('appealSchedule', [])
        );

        $validator = Validator::make($input, [
            'schedule_id' => 'nullable|integer',
            'day' => 'required|in:Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
            'startTime' => 'required|string',
            'endTime' => 'required|string',
            'room' => 'nullable|string',
            'reason' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors()
            ], 422);
        }

        // Convert times like "7:00 AM" to SQL TIME "07:00:00"
        $convertTime = function ($timeStr) {
            $dt = \DateTime::createFromFormat('g:i A', trim($timeStr));
            if (! $dt) {
                // Try 24h format fallback
                $dt = \DateTime::createFromFormat('H:i', trim($timeStr));
            }
            return $dt ? $dt->format('H:i:s') : null;
        };

        $startTime = $convertTime($input['startTime']);
        $endTime = $convertTime($input['endTime']);

        if (! $startTime || ! $endTime) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to parse startTime or endTime. Use "h:mm AM/PM" or "HH:MM" formats.'
            ], 422);
        }

        // Attempt to resolve room_id from room code if rooms table exists
        $roomId = null;
        if (! empty($input['room'])) {
            try {
                $roomId = DB::table('rooms')->where('room_code', $input['room'])->value('id');
            } catch (\Throwable $e) {
                // If rooms table does not exist, ignore and keep room_id null
                $roomId = null;
            }
        }

        // Handle file upload if present
        $filePath = null;
        if ($request->hasFile('appealFile') && $request->file('appealFile')->isValid()) {
            $file = $request->file('appealFile');
            // store in storage/app/public/appeals
            $stored = $file->store('public/appeals');
            if ($stored) {
                // store path without the 'public/' prefix so it is consistent with typical storage usage
                $filePath = Storage::url($stored); // returns a web-accessible url if using public disk
            }
        }

        // Insert into appeals table
        try {
            $id = DB::table('appeals')->insertGetId([
                'schedule_id' => $input['schedule_id'] ?? 0,
                'day' => $input['day'],
                'start_time' => $startTime,
                'end_time' => $endTime,
                'room_id' => $roomId,
                'file_path' => $filePath,
                'reasoning' => $input['reason'],
                'is_approved' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return response()->json([
                'success' => true,
                'appeal_id' => $id
            ], 201);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create appeal record.',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}