<?php

namespace App\Http\Controllers;

use App\Models\FacultyType;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FacultyTypeController extends Controller
{
    public function index(): JsonResponse
    {
        $facultyTypes = FacultyType::all();
        return response()->json($facultyTypes);
    }

    public function store(Request $request): JsonResponse
    {
        $validatedData = $request->validate([
            'faculty_type' => 'required|string|unique:faculty_type',
            'regular_units' => 'required|numeric|min:0',
            'additional_units' => 'required|numeric|min:0',
        ]);

        $facultyType = FacultyType::create($validatedData);

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Faculty Type Created
        // ═══════════════════════════════════════════════════════
        AuditLogger::logCreate(
            model: 'FacultyType',
            modelId: $facultyType->faculty_type_id,
            data: $facultyType->toArray(),
            description: "Created Faculty Type: {$facultyType->faculty_type}"
        );

        return response()->json($facultyType, 201);
    }

    public function show(FacultyType $facultyType): JsonResponse
    {
        return response()->json($facultyType);
    }

    public function update(Request $request, FacultyType $facultyType): JsonResponse
    {
        // 1. Save Old Data
        $oldData = $facultyType->toArray();

        $validatedData = $request->validate([
            'faculty_type' => 'required|string|unique:faculty_type,faculty_type,' . $facultyType->faculty_type_id . ',faculty_type_id',
            'regular_units' => 'required|numeric|min:0',
            'additional_units' => 'required|numeric|min:0',
        ]);

        // 2. Apply Changes
        if (isset($validatedData['faculty_type'])) $facultyType->faculty_type = $validatedData['faculty_type'];
        if (isset($validatedData['regular_units'])) $facultyType->regular_units = $validatedData['regular_units'];
        if (isset($validatedData['additional_units'])) $facultyType->additional_units = $validatedData['additional_units'];

        // 3. Track Detailed Changes
        $changes = [];
        if ($oldData['faculty_type'] != $facultyType->faculty_type) {
            $changes[] = "Type: {$oldData['faculty_type']} → {$facultyType->faculty_type}";
        }
        if ($oldData['regular_units'] != $facultyType->regular_units) {
            $changes[] = "Regular Units: {$oldData['regular_units']} → {$facultyType->regular_units}";
        }
        if ($oldData['additional_units'] != $facultyType->additional_units) {
            $changes[] = "Additional Units: {$oldData['additional_units']} → {$facultyType->additional_units}";
        }

        if (empty($changes)) {
            return response()->json(['message' => 'No changes detected'], 422);
        }

        // 4. Save and Log
        $facultyType->save();
        $changesSummary = implode(', ', $changes);

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Faculty Type Updated
        // ═══════════════════════════════════════════════════════
        AuditLogger::logUpdate(
            model: 'FacultyType',
            modelId: $facultyType->faculty_type_id,
            oldData: $oldData,
            newData: $facultyType->toArray(),
            description: "Updated Faculty Type: {$facultyType->faculty_type} - {$changesSummary}"
        );

        return response()->json($facultyType);
    }

    public function destroy(FacultyType $facultyType): JsonResponse
    {
        // Check if any faculty is using this type
        if ($facultyType->faculty()->exists()) {
            return response()->json([
                'message' => 'Cannot delete faculty type as it is associated with existing faculty members.',
            ], 422);
        }

        // Save data before deleting
        $originalData = $facultyType->toArray();
        $typeName = $facultyType->faculty_type;

        $facultyType->delete();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Faculty Type Deleted
        // ═══════════════════════════════════════════════════════
        AuditLogger::logDelete(
            model: 'FacultyType',
            modelId: $originalData['faculty_type_id'],
            data: $originalData,
            description: "Deleted Faculty Type: {$typeName}"
        );

        return response()->json(null, 204);
    }
}