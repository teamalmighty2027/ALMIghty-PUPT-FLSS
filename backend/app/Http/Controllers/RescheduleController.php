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
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function submitReschedulingAppeal(Request $request)
    {
      $validator = Validator::make($request->all(), [
          'scheduleId' => 'required|integer',
          'appealFile' => 'required|file|mimes:pdf,doc,docx|max:2048',
          'reason' => 'required|string|max:255',
          'day' => 'nullable|string|max:20',
          'startTime' => 'nullable|string|max:10',
          'endTime' => 'nullable|string|max:10',
          'roomCode' => 'nullable|string',
      ]);

      if ($validator->fails()) {
          return response()->json(['errors' => $validator->errors()], 422);
      }

      $scheduleId = $request->input('scheduleId');
      $reason = $request->input('reason');
      $day = $request->input('day');
      $startTime = $request->input('startTime');
      $endTime = $request->input('endTime');
      $roomCode = $request->input('roomCode') ?? null;

      // Check scheduleId and roomId validity
      try {
      $schedule = DB::table('schedules')->where('schedule_id', $scheduleId)->first();
      if (!$schedule) {
        return response()->json(['error' => 'Invalid schedule ID.'], 400);
      }

      $roomId = $roomCode ? DB::table('rooms')
        ->where('room_code', $roomCode)
        ->value('room_id') : null;
      } catch (\Exception $e) {
        return response()->json([
          'error' => 'Database error: ' . $e->getMessage()
        ], 500);
      }
      
      if ($roomCode && !$roomId) {
        return response()->json(['error' => 'Invalid room code.'], 400);
      }

      // Change startTime to sql format
      $startTime = $date = date('H:i:s', strtotime($startTime));
      $endTime = $date = date('H:i:s', strtotime($endTime));

      // Handle file upload
      try {
        if ($request->hasFile('appealFile')) {
            $file = $request->file('appealFile');
            $filePath = $file->store('appeals', 'public');
        } else {
            return response()->json(['error' => 'No appeal file uploaded.'], 400);
        }
      } catch (\Exception $e) {
        return response()->json([
          'message' => 'Failed to upload appeal file',
          'error' => $e->getMessage()
        ], 500);
      }
      
      // Insert into appeals table
      try {
        DB::beginTransaction();
        DB::table('appeals')->insert([
            'schedule_id' => $scheduleId,
            'day' => $day ?? null,
            'start_time' => $startTime ?? null,
            'end_time' => $endTime ?? null,
            'room_id' => $roomId,
            'file_path' => $filePath,
            'is_approved' => false,
            'reasoning' => $reason,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
      } catch (\Exception $e) {
        DB::rollBack();
        return response()->json([
          'message' => 'Failed to submit rescheduling appeal',
          'error' => $e->getMessage()
        ], 500);
      }

      DB::commit();
      return response()->json([
        'message' => 'Rescheduling appeal submitted successfully.'
      ], 200);
    }
}