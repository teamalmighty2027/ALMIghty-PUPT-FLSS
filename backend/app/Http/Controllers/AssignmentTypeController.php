<?php

namespace App\Http\Controllers;

use App\Models\AssignmentType;
use Illuminate\Http\Request;

class AssignmentTypeController extends Controller
{
    // 1. Fetch all load types (for the dropdown and config table)
    public function index()
    {
        // Order alphabetically so the dropdown looks clean
        $types = AssignmentType::orderBy('name')->get();
        return response()->json($types);
    }

    // 2. Create a new load type
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255|unique:assignment_types,name',
        ]);

        $type = AssignmentType::create([
            'name' => $request->name,
        ]);

        return response()->json([
            'message' => 'Load type created successfully.',
            'data' => $type
        ], 201);
    }

    // 3. Update an existing load type
    public function update(Request $request, $id)
    {
        $request->validate([
            'name' => 'required|string|max:255|unique:assignment_types,name,' . $id,
        ]);

        $type = AssignmentType::findOrFail($id);
        $type->update([
            'name' => $request->name,
        ]);

        return response()->json([
            'message' => 'Load type updated successfully.',
            'data' => $type
        ]);
    }

    // 4. Delete a load type
    public function destroy($id)
    {
        $type = AssignmentType::findOrFail($id);
        $type->delete();
        
        // Because we set onDelete('set null') in the migration, 
        // any schedule that had this load type automatically becomes empty!
        return response()->json([
            'message' => 'Load type deleted successfully.'
        ]);
    }
}