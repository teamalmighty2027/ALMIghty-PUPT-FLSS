<?php

namespace App\Http\Controllers;

use App\Models\Building;
use App\Models\Room;
use App\Models\RoomType;
use App\Services\AuditLogger;
use Illuminate\Http\Request;

class RoomController extends Controller
{
    // Fetch all rooms
    public function getRooms()
    {
        $rooms = Room::with('building')
          ->orderBy('room_code')
          ->get();

        return response()->json([
            'success' => true,
            'message' => 'Rooms fetched successfully.',
            'data' => $rooms,
        ], 200);
    }

    // Get all rooms (with a wrapper)
    public function getAllRooms()
    {
        $rooms = Room::with('building')
          ->orderBy('room_code')
          ->get();

        $response = $rooms->map(function ($room) {
            return [
                'room_id' => $room->room_id,
                'room_code' => $room->room_code,
                'building_name' => $room->building->building_name ?? 'N/A',
                'floor_level' => $room->floor_level,
                'room_type' => $room->room_type,
                'capacity' => $room->capacity,
                'status' => $room->status,
            ];
        });

        return response()->json(['rooms' => $response], 200);
    }

    // Add new room
    public function addRoom(Request $request)
    {
        // Validate the incoming request data
        $validated = $request->validate([
            'room_code' => 'required|string|max:255|unique:rooms,room_code',
            'building_id' => 'required|exists:buildings,building_id',
            'floor_level' => 'required|string|max:255',
            'room_type_id' => 'required|exists:room_types,room_type_id',
            'capacity' => 'required|integer|min:1',
            'status' => 'required|string|max:255',
        ]);

        // Create a new room
        $room = Room::create($validated);

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Room Created
        // ═══════════════════════════════════════════════════════
        $room->load('building');
        AuditLogger::logCreate(
            model: 'Room',
            modelId: $room->room_id,
            data: $room->toArray(),
            description: "Created room: {$room->room_code} in {$room->building->building_name}, Capacity: {$room->capacity}"
        );

        return response()->json([
            'success' => true,
            'message' => 'Room added successfully.',
            'data' => $room,
        ], 201);
    }

    // Update room
    public function updateRoom(Request $request, $id)
    {
        $room = Room::findOrFail($id);

        // 1. SAVE OLD DATA
        $oldData = [
            'room_code'    => $room->room_code,
            'building_id'  => $room->building_id,
            'floor_level'  => $room->floor_level,
            'room_type_id' => $room->room_type_id,
            'capacity'     => $room->capacity,
            'status'       => $room->status,
        ];

        // Validate the incoming request data
        $validated = $request->validate([
            'room_code' => 'required|string|max:255|unique:rooms,room_code,' . $id . ',room_id',
            'building_id' => 'required|exists:buildings,building_id',
            'floor_level' => 'required|string|max:255',
            'room_type_id' => 'required|exists:room_types,room_type_id',
            'capacity' => 'required|integer|min:1',
            'status' => 'required|string|max:255',
        ]);

        // 2. APPLY CHANGES
        if (isset($validated['room_code'])) $room->room_code = $validated['room_code'];
        if (isset($validated['building_id'])) $room->building_id = $validated['building_id'];
        if (isset($validated['floor_level'])) $room->floor_level = $validated['floor_level'];
        if (isset($validated['room_type_id'])) $room->room_type_id = $validated['room_type_id'];
        if (isset($validated['capacity'])) $room->capacity = $validated['capacity'];
        if (isset($validated['status'])) $room->status = $validated['status'];

        // Get Names for Logs
        $buildingsMap = Building::pluck('building_name', 'building_id')->toArray();
        $roomTypesMap = RoomType::pluck('type_name', 'room_type_id')->toArray();

        // 3. TRACK CHANGES
        $changes = [];
        if ($oldData['room_code'] != $room->room_code) {
            $changes[] = "Code: {$oldData['room_code']} → {$room->room_code}";
        }
        if ($oldData['building_id'] != $room->building_id) {
            $oldB = $buildingsMap[$oldData['building_id']] ?? "ID {$oldData['building_id']}";
            $newB = $buildingsMap[$room->building_id] ?? "ID {$room->building_id}";
            $changes[] = "Building: {$oldB} → {$newB}";
        }
        if ($oldData['floor_level'] != $room->floor_level) {
            $changes[] = "Floor: {$oldData['floor_level']} → {$room->floor_level}";
        }
        if ($oldData['room_type_id'] != $room->room_type_id) {
            $oldT = $roomTypesMap[$oldData['room_type_id']] ?? "ID {$oldData['room_type_id']}";
            $newT = $roomTypesMap[$room->room_type_id] ?? "ID {$room->room_type_id}";
            $changes[] = "Type: {$oldT} → {$newT}";
        }
        if ($oldData['capacity'] != $room->capacity) {
            $changes[] = "Capacity: {$oldData['capacity']} → {$room->capacity}";
        }
        if ($oldData['status'] != $room->status) {
            $changes[] = "Status: {$oldData['status']} → {$room->status}";
        }

        if (empty($changes)) {
            return response()->json(['message' => 'No changes detected'], 422);
        }

        // 4. SAVE AND LOG
        $room->save();
        $changesSummary = implode(', ', $changes);

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Room Updated
        // ═══════════════════════════════════════════════════════
        AuditLogger::logUpdate(
            model: 'Room',
            modelId: $room->room_id,
            oldData: $oldData,
            newData: $room->toArray(),
            description: "Updated room: {$room->room_code} - {$changesSummary}"
        );

        return response()->json([
            'success' => true,
            'message' => 'Room updated successfully.',
            'data' => $room,
        ], 200);
    }

    // Delete room
    public function deleteRoom($id)
    {
        $room = Room::findOrFail($id);

        // Check if room has any schedules
        if ($room->schedules()->count() > 0) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot delete room. It has associated schedules.',
            ], 400);
        }

        // ═══════════════════════════════════════════════════════
        // SAVE DATA FOR AUDIT BEFORE DELETION
        // ═══════════════════════════════════════════════════════
        $roomData = $room->toArray();

        // Delete the room
        $room->delete();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Room Deleted
        // ═══════════════════════════════════════════════════════
        AuditLogger::logDelete(
            model: 'Room',
            modelId: $roomData['room_id'],
            data: $roomData,
            description: "Deleted room: {$roomData['room_code']}"
        );

        return response()->json([
            'success' => true,
            'message' => 'Room deleted successfully.',
        ], 200);
    }

    // Get available floor levels for a building
    public function getFloorLevels($buildingId)
    {
        $building = Building::findOrFail($buildingId);
        $floorLevels = range(1, $building->floor_levels);
        return response()->json([
            'success' => true,
            'data' => $floorLevels,
        ], 200);
    }
}