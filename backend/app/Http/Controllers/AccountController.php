<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Role;
use App\Models\Permission;
use App\Services\AuditLogger;
use Illuminate\Validation\Rule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rules\Password;

class AccountController extends Controller
{
    /**
     * ===================================
     * Admin/Superadmin Account Management
     * ===================================
     */

    /**
     * GET all admin and superadmin accounts
     */
    public function indexAdmins()
    {
        $admins = User::whereHas('roleModel', function ($q) {
            $q->where('name', 'admin');
        })->get();

        return response()->json($admins);
    }

    /**
     * CREATE new admin/superadmin account
     */
    public function storeAdmin(Request $request)
    {
        $adminRoleId = Role::where('name', 'admin')->value('id');

        $validatedData = $request->validate([
            'last_name' => 'required|string|max:255',
            'first_name' => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'suffix_name' => 'nullable|string|max:255',
            'code' => 'required|string|max:255|unique:users',
            'email' => [
              'required', 'email',
              Rule::unique('users')->where('role_id', $adminRoleId),
            ],
            'password' => [
                'required',
                'string',
                Password::min(12)
                    ->mixedCase()
                    ->numbers()
                    ->symbols(),
            ],
            'role' => 'required|in:admin',
            'status' => 'required|in:Active,Inactive,Retired',
        ]);

        $existingCode = User::where('code', $validatedData['code'])->exists();

        if ($existingCode) {
            return response()->json([
                'message' => 'Admin code already exists.',
                'errors' => ['code' => ['This admin code is already taken.']],
            ], 422);
        }

        try {
            return DB::transaction(function () use ($validatedData, $adminRoleId) {
                $admin = User::create([
                    'last_name' => $validatedData['last_name'],
                    'first_name' => $validatedData['first_name'],
                    'middle_name' => $validatedData['middle_name'],
                    'suffix_name' => $validatedData['suffix_name'],
                    'code' => $validatedData['code'],
                    'email' => $validatedData['email'],
                    'role_id' => $adminRoleId,
                    'password' => $validatedData['password'],
                    'status' => $validatedData['status'],
                ]);

                // Auto-assign all permissions to new admin (full access)
                $allPermissions = Permission::pluck('id')->toArray();
                $admin->permissions()->attach($allPermissions);

                // ═══════════════════════════════════════════════════════
                // AUDIT LOG: Admin Created
                // ═══════════════════════════════════════════════════════
                AuditLogger::logCreate(
                    model: 'User',
                    modelId: $admin->id,
                    data: $admin->toArray(),
                    description: "Created admin account: {$admin->formatted_name} ({$admin->email})"
                );

                return response()->json($admin, 201);
            });
        } catch (\Exception $e) {
            Log::error('Admin creation failed: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'message' => 'Failed to create admin account',
                'error' => config('app.debug') ? $e->getMessage() : 'An error occurred'
            ], 500);
        }
    }

    /**
     * UPDATE admin/superadmin account details
     */
    public function updateAdmin(Request $request, User $admin)
    {
        $adminRoleId = Role::where('name', 'admin')->value('id');

        // ═══════════════════════════════════════════════════════
        // SAVE OLD DATA FOR DETAILED CHANGE TRACKING
        // ═══════════════════════════════════════════════════════
        $oldData = [
            'first_name' => $admin->first_name,
            'middle_name' => $admin->middle_name,
            'last_name' => $admin->last_name,
            'suffix_name' => $admin->suffix_name,
            'code' => $admin->code,
            'email' => $admin->email,
            'role' => $admin->role,
            'status' => $admin->status,
        ];

        $validatedData = $request->validate([
            'last_name' => 'sometimes|required|string|max:255',
            'first_name' => 'sometimes|required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'suffix_name' => 'nullable|string|max:255',
            'code' => 'sometimes|required|string|max:255|unique:users,code,' . $admin->id,
            // Email must be unique within the same role only.
            'email' => [
              'sometimes', 'required', 'email',
              Rule::unique('users')->where('role_id', $adminRoleId)
                ->ignore($admin->id),
            ],
            'password' => [
                'sometimes',
                'string',
                Password::min(12)
                    ->mixedCase()
                    ->numbers()
                    ->symbols(),
            ],
            'role' => 'sometimes|required|in:admin',
            'status' => 'sometimes|required|in:Active,Inactive,Retired',
        ]);

        try {
            return DB::transaction(function () use ($admin, $validatedData, $oldData, $adminRoleId) {
                // Update the user model instances manually
                if (isset($validatedData['last_name'])) $admin->last_name = $validatedData['last_name'];
                if (isset($validatedData['first_name'])) $admin->first_name = $validatedData['first_name'];
                if (isset($validatedData['middle_name'])) $admin->middle_name = $validatedData['middle_name'];
                if (isset($validatedData['suffix_name'])) $admin->suffix_name = $validatedData['suffix_name'];
                if (isset($validatedData['code'])) $admin->code = $validatedData['code'];
                if (isset($validatedData['email'])) $admin->email = $validatedData['email'];
                if (isset($validatedData['role'])) $admin->role_id = $adminRoleId;
                if (isset($validatedData['status'])) $admin->status = $validatedData['status'];

                // Handle password update
                $passwordChanged = false;
                if (isset($validatedData['password'])) {
                    $admin->password = $validatedData['password'];
                    $passwordChanged = true;
                }

                // ═══════════════════════════════════════════════════════
                // AUDIT LOG: DETAILED CHANGE TRACKING
                // ═══════════════════════════════════════════════════════
                $changes = [];

                if ($oldData['first_name'] != $admin->first_name || 
                    $oldData['middle_name'] != $admin->middle_name || 
                    $oldData['last_name'] != $admin->last_name ||
                    $oldData['suffix_name'] != $admin->suffix_name) {
                    
                    $oldName = trim("{$oldData['first_name']} {$oldData['middle_name']} {$oldData['last_name']} {$oldData['suffix_name']}");
                    $changes[] = "Name: {$oldName} → {$admin->formatted_name}";
                }

                if ($oldData['email'] != $admin->email) {
                    $changes[] = "Email: {$oldData['email']} → {$admin->email}";
                }

                if ($oldData['code'] != $admin->code) {
                    $changes[] = "Code: {$oldData['code']} → {$admin->code}";
                }

                if ($oldData['role'] != $admin->role) {
                    $changes[] = "Role: {$oldData['role']} → {$admin->role}";
                }

                if ($oldData['status'] != $admin->status) {
                    $changes[] = "Status: {$oldData['status']} → {$admin->status}";
                }

                if ($passwordChanged) {
                    $changes[] = "Password changed";
                }

                // Stop if nothing was actually changed
                if (count($changes) === 0) {
                    throw new \Exception('No changes detected');
                }

                // Actually save to DB now that we are sure there are changes
                $admin->save();

                // Log it
                $changesSummary = implode(', ', $changes);
                
                AuditLogger::logUpdate(
                    model: 'User',
                    modelId: $admin->id,
                    oldData: $oldData,
                    newData: [
                        'first_name' => $admin->first_name,
                        'middle_name' => $admin->middle_name,
                        'last_name' => $admin->last_name,
                        'suffix_name' => $admin->suffix_name,
                        'code' => $admin->code,
                        'email' => $admin->email,
                        'role' => $admin->role,
                        'status' => $admin->status,
                    ],
                    description: "Updated admin: {$admin->formatted_name} - {$changesSummary}"
                );

                return response()->json([
                    'message' => 'Admin updated successfully',
                    'updated_fields' => $changes,
                    'admin' => $admin,
                ]);
            });
        } catch (\Exception $e) {
            Log::error('Admin update failed: ' . $e->getMessage(), [
                'user_id' => $admin->id,
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'message' => 'Failed to update admin',
                'error' => config('app.debug') ? $e->getMessage() : 'An error occurred'
            ], 500);
        }
    }

    /**
     * DELETE an admin/superadmin account
     */
    public function destroyAdmin(User $admin)
    {
        if ($admin->role !== 'admin' && $admin->role !== 'superadmin') {
            return response()->json(['message' => 'User is not an admin'], 400);
        }

        try {
            return DB::transaction(function () use ($admin) {
                // ═══════════════════════════════════════════════════════
                // SAVE DATA FOR AUDIT BEFORE DELETION
                // ═══════════════════════════════════════════════════════
                $adminData = $admin->toArray();
                $formattedName = $admin->formatted_name; // Store to use in description later
                
                $admin->delete();

                // ═══════════════════════════════════════════════════════
                // AUDIT LOG: Admin Deleted
                // ═══════════════════════════════════════════════════════
                AuditLogger::logDelete(
                    model: 'User',
                    modelId: $adminData['id'],
                    data: $adminData,
                    description: "Deleted admin account: {$formattedName} ({$adminData['email']})"
                );

                return response()->json(null, 204);
            });
        } catch (\Exception $e) {
            Log::error('Admin deletion failed: ' . $e->getMessage(), [
                'user_id' => $admin->id,
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'message' => 'Failed to delete admin',
                'error' => config('app.debug') ? $e->getMessage() : 'An error occurred'
            ], 500);
        }
    }

    /**
     * ===================================
     * Permission Management Methods
     * ===================================
     */

    /**
     * GET all available permissions
     */
    public function getPermissions()
    {
        $permissions = Permission::select('id', 'permission_key', 'display_name', 'description', 'category')
            ->orderBy('category')
            ->orderBy('display_name')
            ->get();

        return response()->json($permissions);
    }

    /**
     * GET specific admin's permissions and allowed programs
     */
    public function getAdminPermissions(User $admin)
    {
        if ($admin->role !== 'admin' && $admin->role !== 'superadmin') {
            return response()->json(['message' => 'User is not an admin'], 400);
        }

        $permissions = $admin->permissions()
            ->select('permissions.id', 'permission_key', 'display_name')
            ->get();

        $allowedPrograms = $admin->allowedPrograms()
            ->select('programs.program_id', 'program_code', 'program_title')
            ->get();

        $isFullAccess = $admin->isFullAccess();

        return response()->json([
            'admin_id' => $admin->id,
            'permissions' => $permissions,
            'allowed_programs' => $allowedPrograms,
            'is_full_access' => $isFullAccess,
        ]);
    }

    /**
     * UPDATE admin's permissions and allowed programs
     */
    public function updateAdminPermissions(Request $request, User $admin)
    {
        if ($admin->role !== 'admin' && $admin->role !== 'superadmin') {
            return response()->json(['message' => 'User is not an admin'], 400);
        }

        // Eager load permissions and programs to avoid N+1 queries
        $admin->load('permissions', 'allowedPrograms');

        $validatedData = $request->validate([
            'permissions' => 'nullable|array',
            'permissions.*' => 'integer|exists:permissions,id',
            'allowed_programs' => 'nullable|array',
            'allowed_programs.*' => 'integer|exists:programs,program_id',
        ]);

        $oldPermissions = $admin->permissions->pluck('permission_key')->toArray();
        $oldPrograms = $admin->getAllowedProgramIds();

        try {
            return DB::transaction(function () use ($admin, $validatedData, $oldPermissions, $oldPrograms) {
                // Sync permissions
                if (isset($validatedData['permissions'])) {
                    $admin->permissions()->sync($validatedData['permissions']);
                } else {
                    $admin->permissions()->detach();
                }

                // Sync allowed programs
                if (isset($validatedData['allowed_programs'])) {
                    $admin->allowedPrograms()->sync($validatedData['allowed_programs']);
                } else {
                    $admin->allowedPrograms()->detach();
                }

                // Reload relations after sync
                $admin->load('permissions', 'allowedPrograms');
                $newPermissions = $admin->permissions->pluck('permission_key')->toArray();
                $newPrograms = $admin->getAllowedProgramIds();

                // Log the permission change
                AuditLogger::log(
                    action: 'update',
                    description: "Updated permissions for admin: {$admin->formatted_name}",
                    model: 'User',
                    modelId: $admin->id,
                    metadata: [
                        'old_permissions' => $oldPermissions,
                        'new_permissions' => $newPermissions,
                        'old_programs' => $oldPrograms,
                        'new_programs' => $newPrograms,
                        'action_type' => 'permission_update',
                    ]
                );

                return response()->json([
                    'message' => 'Admin permissions updated successfully',
                    'admin_id' => $admin->id,
                    'permissions' => $admin->permissions->select('id', 'permission_key', 'display_name'),
                    'allowed_programs' => $admin->allowedPrograms->select('program_id', 'program_code', 'program_title'),
                    'is_full_access' => $admin->isFullAccess(),
                ]);
            });
        } catch (\Exception $e) {
            Log::error('Admin permissions update failed: ' . $e->getMessage(), [
                'user_id' => $admin->id,
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'message' => 'Failed to update admin permissions',
                'error' => config('app.debug') ? $e->getMessage() : 'An error occurred'
            ], 500);
        }
    }
}