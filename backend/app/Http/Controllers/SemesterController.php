<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Semester;
use App\Services\AuditLogger;

class SemesterController extends Controller
{
    // List all semesters
    public function index()
    {
        $semesters = Semester::with('yearLevel')->get(); 
        return response()->json($semesters);
    }

    // Create a new semester
    public function store(Request $request)
    {
        // Fetch the latest semester_id
        $latestSemesterId = Semester::max('semester_id');

        // Validate the incoming request data
        $validatedData = $request->validate([
            'year_level_id' => 'required|integer|exists:year_levels,year_level_id',
            'semester' => 'required|integer|unique:semesters,semester,NULL,semester_id,year_level_id,' . $request->year_level_id,
        ]);

        // Create a new semester
        $semester = Semester::create($validatedData);

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Semester Created
        // ═══════════════════════════════════════════════════════
        AuditLogger::logCreate(
            model: 'Semester',
            modelId: $semester->semester_id,
            data: $semester->toArray(),
            description: "Created semester: {$semester->semester} for Year Level ID: {$semester->year_level_id}"
        );

        return response()->json([
            'message' => 'Semester created successfully',
            'latest_semester_id' => $latestSemesterId,
            'semester' => $semester
        ], 201);
    }

    // Show a specific semester
    public function show($id)
    {
        $semester = Semester::with('yearLevel')->findOrFail($id);
        return response()->json($semester);
    }

    // Update a semester
    public function update(Request $request, $id)
    {
        $semester = Semester::findOrFail($id);

        // ═══════════════════════════════════════════════════════
        // SAVE OLD DATA FOR DETAILED CHANGE TRACKING
        // ═══════════════════════════════════════════════════════
        $oldData = [
            'year_level_id' => $semester->year_level_id,
            'semester'      => $semester->semester,
        ];

        $validatedData = $request->validate([
            'year_level_id' => 'required|integer|exists:year_levels,year_level_id',
            'semester' => 'required|integer|unique:semesters,semester,' . $id . ',semester_id,year_level_id,' . $request->year_level_id,
        ]);

        // Manually assign to check dirtiness
        if (isset($validatedData['year_level_id'])) $semester->year_level_id = $validatedData['year_level_id'];
        if (isset($validatedData['semester'])) $semester->semester = $validatedData['semester'];

        $changes = [];

        if ($oldData['year_level_id'] != $semester->year_level_id) {
            $changes[] = "Year Level ID: {$oldData['year_level_id']} → {$semester->year_level_id}";
        }
        if ($oldData['semester'] != $semester->semester) {
            $changes[] = "Semester Number: {$oldData['semester']} → {$semester->semester}";
        }

        if (empty($changes)) {
            return response()->json(['message' => 'No changes detected'], 422);
        }

        $semester->save();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Semester Updated
        // ═══════════════════════════════════════════════════════
        $changesSummary = implode(', ', $changes);
        AuditLogger::logUpdate(
            model: 'Semester',
            modelId: $semester->semester_id,
            oldData: $oldData,
            newData: $semester->toArray(),
            description: "Updated semester ID {$semester->semester_id} - {$changesSummary}"
        );

        return response()->json([
            'message' => 'Semester updated successfully',
            'semester' => $semester
        ], 200);
    }

    // Delete a semester
    public function destroy($id)
    {
        $semester = Semester::findOrFail($id);
        
        // ═══════════════════════════════════════════════════════
        // SAVE DATA FOR AUDIT BEFORE DELETION
        // ═══════════════════════════════════════════════════════
        $originalData = $semester->toArray();
        $semesterNumber = $semester->semester;
        $yearLevelId = $semester->year_level_id;

        $semester->delete();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Semester Deleted
        // ═══════════════════════════════════════════════════════
        AuditLogger::logDelete(
            model: 'Semester',
            modelId: $id,
            data: $originalData,
            description: "Deleted semester {$semesterNumber} from Year Level ID: {$yearLevelId}"
        );

        return response()->json([
            'message' => 'Semester deleted successfully'
        ], 200);
    }
}