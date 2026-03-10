<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\YearLevel;
use App\Services\AuditLogger;

class YearLevelController extends Controller
{
    // List all year levels
    public function index()
    {
        $yearLevels = YearLevel::with('semesters')->get(); 
        return response()->json($yearLevels);
    }

    // Create a new year level
    public function store(Request $request)
    {
        $latestYearLevelId = YearLevel::max('year_level_id');

        $validatedData = $request->validate([
            'year' => 'required|integer|unique:year_levels,year,NULL,year_level_id,program_id,' . $request->program_id,
            'program_id' => 'required|integer|exists:programs,program_id',
        ]);

        $yearLevel = YearLevel::create($validatedData);

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Year Level Created
        // ═══════════════════════════════════════════════════════
        AuditLogger::logCreate(
            model: 'YearLevel',
            modelId: $yearLevel->year_level_id,
            data: $yearLevel->toArray(),
            description: "Created Year {$yearLevel->year} for Program ID: {$yearLevel->program_id}"
        );

        return response()->json([
            'message' => 'Year Level created successfully',
            'latest_year_level_id' => $latestYearLevelId,
            'year_level' => $yearLevel
        ], 201);
    }

    // Show a specific year level
    public function show($id)
    {
        $yearLevel = YearLevel::with('semesters')->findOrFail($id);
        return response()->json($yearLevel);
    }

    // Update a year level
    public function update(Request $request, $id)
    {
        $yearLevel = YearLevel::findOrFail($id);

        // 1. Save Old Data
        $oldData = [
            'year' => $yearLevel->year,
            'program_id' => $yearLevel->program_id,
        ];

        $validatedData = $request->validate([
            'year' => 'required|integer|unique:year_levels,year,' . $id . ',year_level_id,program_id,' . $request->program_id,
            'program_id' => 'required|integer|exists:programs,program_id',
        ]);

        // 2. Apply updates
        $yearLevel->year = $validatedData['year'];
        $yearLevel->program_id = $validatedData['program_id'];

        $programsMap = \App\Models\Program::pluck('program_code', 'program_id')->toArray();

        // 3. Track changes
        $changes = [];
        if ($oldData['year'] != $yearLevel->year) {
            $changes[] = "Year: {$oldData['year']} → {$yearLevel->year}";
        }
        if ($oldData['program_id'] != $yearLevel->program_id) {
            $oldP = $programsMap[$oldData['program_id']] ?? "ID {$oldData['program_id']}";
            $newP = $programsMap[$yearLevel->program_id] ?? "ID {$yearLevel->program_id}";
            $changes[] = "Program: {$oldP} → {$newP}";
        }

        if (empty($changes)) {
            return response()->json(['message' => 'No changes detected'], 422);
        }

        // 4. Save and Log
        $yearLevel->save();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Year Level Updated
        // ═══════════════════════════════════════════════════════
        $changesSummary = implode(', ', $changes);
        AuditLogger::logUpdate(
            model: 'YearLevel',
            modelId: $yearLevel->year_level_id,
            oldData: $oldData,
            newData: $yearLevel->toArray(),
            description: "Updated Year Level ID {$yearLevel->year_level_id} - {$changesSummary}"
        );

        return response()->json([
            'message' => 'Year Level updated successfully',
            'year_level' => $yearLevel
        ], 200);
    }

    // Delete a year level
    public function destroy($id)
    {
        $yearLevel = YearLevel::findOrFail($id);

        // Save data for log
        $originalData = $yearLevel->toArray();
        $yearValue = $yearLevel->year;
        $programId = $yearLevel->program_id;

        $yearLevel->delete();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Year Level Deleted
        // ═══════════════════════════════════════════════════════
        AuditLogger::logDelete(
            model: 'YearLevel',
            modelId: $id,
            data: $originalData,
            description: "Deleted Year {$yearValue} from Program ID {$programId}"
        );

        return response()->json([
            'message' => 'Year Level deleted successfully'
        ], 200);
    }
}