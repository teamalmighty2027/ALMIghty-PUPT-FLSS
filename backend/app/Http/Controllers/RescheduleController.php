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
          'appealFile' => 'file|mimes:pdf,doc,docx|max:2048', // TODO: Make required when file upload is implemented
          'reason' => 'required|string|max:255',
          'day' => 'nullable|string|max:20',
          'startTime' => 'nullable|string|max:10',
          'endTime' => 'nullable|string|max:10',
          'roomId' => 'nullable|string', // TODO: Change to integer when roomId is implemented
      ]);

      if ($validator->fails()) {
          return response()->json(['errors' => $validator->errors()], 422);
      }

      $scheduleId = $request->input('scheduleId');
      $reason = $request->input('reason');
      $day = $request->input('day');
      $startTime = $request->input('startTime');
      $endTime = $request->input('endTime');
      $roomId = $request->input('roomId');

      // TODO: Check scheduleId and roomId validity

      // Change startTime to sql format
      $startTime = $date = date('H:i:s', strtotime($startTime));
      $endTime = $date = date('H:i:s', strtotime($endTime));

      // Handle file upload
      if ($request->hasFile('appealFile')) {
          $file = $request->file('appealFile');
          // TODO: Fix file saving path according to storage setup
          $filePath = $file->store('appeals', 'public');
      } else {
          return response()->json(['error' => 'No appeal file uploaded.'], 400);
      }

      // Insert into appeals table
      DB::table('appeals')->insert([
          'schedule_id' => $scheduleId,
          'day' => $day ?? null,
          'start_time' => $startTime ?? null,
          'end_time' => $endTime ?? null,
          'room_id' => 2, // TODO: Change default roomId when roomId is implemented
          'file_path' => $filePath,
          'is_approved' => false,
          'reasoning' => $reason,
          'created_at' => now(),
          'updated_at' => now(),
      ]);

      return response()->json(['message' => 'Rescheduling appeal submitted successfully.'], 200);
    
    }
}