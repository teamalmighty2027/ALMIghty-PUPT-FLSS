<?php

namespace App\Http\Controllers;

use App\Models\DesigneeRole;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DesigneeRoleController extends Controller
{
    // Returns a list of all designee roles.
    public function index(): JsonResponse
    {
        $roles = DesigneeRole::all();

        return response()->json($roles);
    }

    // Stores a newly created designee role in the database.
    public function store(Request $request): JsonResponse
    {
        $validatedData = $request->validate([
            'role_name' => 'required|string|unique:designee_role',
        ]);

        $role = DesigneeRole::create($validatedData);

        AuditLogger::logCreate(
            model: 'DesigneeRole',
            modelId: $role->designee_role_id,
            data: $role->toArray(),
            description: "Created Designee Role: {$role->role_name}"
        );

        return response()->json($role, 201);
    }

    // Displays the specified designee role.
    public function show(DesigneeRole $designeeRole): JsonResponse
    {
        return response()->json($designeeRole);
    }

    // Updates the specified designee role in the database.
    public function update(
        Request $request,
        DesigneeRole $designeeRole
    ): JsonResponse {
        $oldData = $designeeRole->toArray();

        $validatedData = $request->validate([
            'role_name' => 'required|string|unique:designee_role,role_name,' .
                $designeeRole->designee_role_id . ',designee_role_id',
        ]);

        if ($oldData['role_name'] === $validatedData['role_name']) {
            return response()->json(
                ['message' => 'No changes detected'],
                422
            );
        }

        $designeeRole->role_name = $validatedData['role_name'];
        $designeeRole->save();

        AuditLogger::logUpdate(
            model: 'DesigneeRole',
            modelId: $designeeRole->designee_role_id,
            oldData: $oldData,
            newData: $designeeRole->toArray(),
            description: "Updated Designee Role: {$oldData['role_name']}" .
                " → {$designeeRole->role_name}"
        );

        return response()->json($designeeRole);
    }

    // Deletes the specified designee role from the database.
    public function destroy(DesigneeRole $designeeRole): JsonResponse
    {
        if ($designeeRole->facultyTypes()->exists()) {
            return response()->json([
                'message' => 'Cannot delete designee role as it is ' .
                    'associated with existing faculty types.',
            ], 422);
        }

        $originalData = $designeeRole->toArray();
        $roleName = $designeeRole->role_name;

        $designeeRole->delete();

        AuditLogger::logDelete(
            model: 'DesigneeRole',
            modelId: $originalData['designee_role_id'],
            data: $originalData,
            description: "Deleted Designee Role: {$roleName}"
        );

        return response()->json(null, 204);
    }
}
