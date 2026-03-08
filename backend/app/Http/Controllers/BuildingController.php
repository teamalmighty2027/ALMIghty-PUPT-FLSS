<?php

namespace App\Http\Controllers;

use App\Models\Building;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class BuildingController extends Controller
{
    public function index()
    {
        $buildings = Building::all();
        return response()->json($buildings);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'building_name' => 'required|string|max:191',
            'floor_levels' => 'required|integer|min:1',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $building = Building::create($request->all());

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Building Created
        // ═══════════════════════════════════════════════════════
        AuditLogger::logCreate(
            model: 'Building',
            modelId: $building->getKey(), // Use getKey() to automatically get the primary key (building_id)
            data: $building->toArray(),
            description: "Created building: {$building->building_name} with {$building->floor_levels} floor(s)"
        );

        return response()->json($building, 201);
    }

    public function show($id)
    {
        $building = Building::findOrFail($id);
        return response()->json($building);
    }

    public function update(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'building_name' => 'required|string|max:191',
            'floor_levels' => 'required|integer|min:1',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $building = Building::findOrFail($id);
        $newFloorLevels = $request->input('floor_levels');

        if ($newFloorLevels < $building->floor_levels) {
            $rooms = $building->rooms()->get();

            foreach ($rooms as $room) {
                $floorNumber = intval($room->floor_level);

                if ($floorNumber > $newFloorLevels) {
                    return response()->json([
                        'message' => "Cannot reduce floor levels. Room {$room->room_code} is on {$room->floor_level} floor.",
                        'success' => false,
                    ], 400);
                }
            }
        }

        // ═══════════════════════════════════════════════════════
        // SAVE OLD DATA FOR DETAILED CHANGE TRACKING
        // ═══════════════════════════════════════════════════════
        $oldData = $building->toArray();
        
        // Fill the model with new data to check what is "dirty" (changed)
        $building->fill($request->all());

        if (!$building->isDirty()) {
            return response()->json([
                'message' => 'No changes detected.',
                'success' => true,
                'data' => $building,
            ], 200);
        }

        $changes = [];

        // Check for Building Name changes
        if ($building->isDirty('building_name')) {
            $changes[] = "Name: {$oldData['building_name']} → {$building->building_name}";
        }

        // Check for Floor Level changes
        if ($building->isDirty('floor_levels')) {
            $changes[] = "Floors: {$oldData['floor_levels']} → {$building->floor_levels}";
        }

        // Save the changes to the database
        $building->save();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Building Updated
        // ═══════════════════════════════════════════════════════
        $changesSummary = implode(', ', $changes);

        AuditLogger::logUpdate(
            model: 'Building',
            modelId: $building->getKey(),
            oldData: $oldData,
            newData: $building->toArray(),
            description: "Updated building: {$building->building_name} - {$changesSummary}"
        );

        return response()->json([
            'message' => 'Building updated successfully.',
            'success' => true,
            'data' => $building,
        ], 200);
    }

    public function destroy($id)
    {
        $building = Building::findOrFail($id);

        if ($building->rooms()->count() > 0) {
            return response()->json([
                'message' => 'Cannot delete building because it has associated rooms.',
                'success' => false,
            ], 400);
        }

        // ═══════════════════════════════════════════════════════
        // SAVE DATA FOR AUDIT BEFORE DELETION
        // ═══════════════════════════════════════════════════════
        $buildingData = $building->toArray();
        $buildingName = $building->building_name;

        $building->delete();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Building Deleted
        // ═══════════════════════════════════════════════════════
        AuditLogger::logDelete(
            model: 'Building',
            modelId: $id,
            data: $buildingData,
            description: "Deleted building: {$buildingName}"
        );

        return response()->json([
            'message' => 'Building deleted successfully.',
            'success' => true,
        ], 200);
    }
}