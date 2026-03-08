<?php

namespace App\Http\Controllers;

use App\Models\RoomType;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class RoomTypeController extends Controller
{
    public function index()
    {
        $roomTypes = RoomType::all();
        return response()->json([
            'success' => true,
            'message' => 'Room types retrieved successfully',
            'data' => $roomTypes,
        ]);
    }

    public function show($id)
    {
        $roomType = RoomType::find($id);
        if (!$roomType) {
            return response()->json([
                'success' => false,
                'message' => 'Room type not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'message' => 'Room type retrieved successfully',
            'data' => $roomType,
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'type_name' => 'required|string|max:191|unique:room_types',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation error',
                'errors' => $validator->errors(),
            ], 422);
        }

        $roomType = RoomType::create($request->all());

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Room Type Created
        // ═══════════════════════════════════════════════════════
        AuditLogger::logCreate(
            model: 'RoomType',
            modelId: $roomType->room_type_id,
            data: $roomType->toArray(),
            description: "Created Room Type: {$roomType->type_name}"
        );

        return response()->json([
            'success' => true,
            'message' => 'Room type created successfully',
            'data' => $roomType,
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $roomType = RoomType::find($id);
        if (!$roomType) {
            return response()->json([
                'success' => false,
                'message' => 'Room type not found',
            ], 404);
        }

        // 1. Save Old Data
        $oldData = $roomType->toArray();

        $validator = Validator::make($request->all(), [
            'type_name' => 'required|string|max:191|unique:room_types,type_name,' . $id . ',room_type_id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation error',
                'errors' => $validator->errors(),
            ], 422);
        }

        // 2. Apply Change
        $roomType->type_name = $request->input('type_name');

        // 3. Track Change
        $changes = [];
        if ($oldData['type_name'] != $roomType->type_name) {
            $changes[] = "Name: {$oldData['type_name']} → {$roomType->type_name}";
        }

        if (empty($changes)) {
            return response()->json([
                'success' => false,
                'message' => 'No changes detected',
            ], 422);
        }

        // 4. Save and Log
        $roomType->save();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Room Type Updated
        // ═══════════════════════════════════════════════════════
        AuditLogger::logUpdate(
            model: 'RoomType',
            modelId: $roomType->room_type_id,
            oldData: $oldData,
            newData: $roomType->toArray(),
            description: "Updated Room Type - " . implode(', ', $changes)
        );

        return response()->json([
            'success' => true,
            'message' => 'Room type updated successfully',
            'data' => $roomType,
        ]);
    }

    public function destroy($id)
    {
        $roomType = RoomType::find($id);
        if (!$roomType) {
            return response()->json([
                'success' => false,
                'message' => 'Room type not found',
            ], 404);
        }

        if ($roomType->rooms()->count() > 0) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot delete room type as it is being used by rooms.',
            ], 422);
        }

        // Save data before deletion
        $originalData = $roomType->toArray();
        $typeName = $roomType->type_name;

        $roomType->delete();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Room Type Deleted
        // ═══════════════════════════════════════════════════════
        AuditLogger::logDelete(
            model: 'RoomType',
            modelId: $id,
            data: $originalData,
            description: "Deleted Room Type: {$typeName}"
        );

        return response()->json([
            'success' => true,
            'message' => 'Room type deleted successfully',
        ]);
    }
}