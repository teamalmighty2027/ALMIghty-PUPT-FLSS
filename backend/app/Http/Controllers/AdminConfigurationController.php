<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\AcademicRank;
use App\Models\Program; 
use Illuminate\Support\Facades\Log;

class AdminConfigurationController extends Controller
{
    // ==========================================
    // ACADEMIC RANKS
    // ==========================================

    public function getAcademicRanks()
    {
        // Return all ranks ordered alphabetically
        return response()->json(AcademicRank::orderBy('name')->get());
    }

    public function addAcademicRank(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255|unique:academic_ranks,name'
        ]);

        $rank = AcademicRank::create([
            'name' => $request->name,
            'is_active' => true
        ]);

        return response()->json(['message' => 'Academic Rank added successfully', 'data' => $rank]);
    }

    public function updateAcademicRank(Request $request, $id)
    {
        $rank = AcademicRank::findOrFail($id);

        $request->validate([
            'name' => 'required|string|max:255|unique:academic_ranks,name,' . $id,
            'is_active' => 'boolean'
        ]);

        $rank->update($request->only(['name', 'is_active']));

        return response()->json(['message' => 'Academic Rank updated successfully', 'data' => $rank]);
    }

    public function deleteAcademicRank($id)
    {
        $rank = AcademicRank::findOrFail($id);
        $rank->delete();
        
        return response()->json(['message' => 'Academic Rank deleted successfully']);
    }

    // ==========================================
    // DEPARTMENTS (PROGRAMS)
    // ==========================================

    public function getDepartments()
    {
        return response()->json(Program::orderBy('program_title')->get());
    }

    public function addDepartment(Request $request)
    {
        $request->validate([
            'program_code' => 'required|string|max:255|unique:programs,program_code',
            'program_title' => 'required|string|max:255|unique:programs,program_title'
        ]);

        $program = Program::create([
            'program_code' => $request->program_code,
            'program_title' => $request->program_title,
            'status' => 'Active', // Default status based on your model
        ]);

        return response()->json(['message' => 'Department added successfully', 'data' => $program]);
    }

    public function updateDepartment(Request $request, $id)
    {
        $program = Program::where('program_id', $id)->firstOrFail();

        $request->validate([
            'program_code' => 'required|string|max:255|unique:programs,program_code,' . $id . ',program_id',
            'program_title' => 'required|string|max:255|unique:programs,program_title,' . $id . ',program_id'
        ]);

        $program->update($request->only(['program_code', 'program_title']));

        return response()->json(['message' => 'Department updated successfully', 'data' => $program]);
    }

    public function deleteDepartment($id)
    {
        $program = Program::where('program_id', $id)->firstOrFail();
        $program->delete();

        return response()->json(['message' => 'Department deleted successfully']);
    }
}