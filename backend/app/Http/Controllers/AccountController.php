<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;

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
        // Fetch users with role 'admin' only
        $admins = User::where('role', 'admin')->get();
        return response()->json($admins);
    }

    /**
     * CREATE new admin/superadmin account
     */
    public function storeAdmin(Request $request)
    {
        $validatedData = $request->validate([
            'last_name' => 'required|string|max:255',
            'first_name' => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'suffix_name' => 'nullable|string|max:255',
            'code' => 'required|string|max:255|unique:users',
            'email' => 'required|email|unique:users',
            'password' => 'required|string|min:8',
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

        $admin = User::create([
            'last_name' => $validatedData['last_name'],
            'first_name' => $validatedData['first_name'],
            'middle_name' => $validatedData['middle_name'],
            'suffix_name' => $validatedData['suffix_name'],
            'code' => $validatedData['code'],
            'email' => $validatedData['email'],
            'role' => $validatedData['role'],
            'password' => $validatedData['password'],
            'status' => $validatedData['status'],
        ]);

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
    }

    /**
     * UPDATE admin/superadmin account details
     */
    public function updateAdmin(Request $request, User $admin)
    {
        try {
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
                'email' => 'sometimes|required|email|unique:users,email,' . $admin->id,
                'password' => 'sometimes|string|min:8',
                'role' => 'sometimes|required|in:admin',
                'status' => 'sometimes|required|in:Active,Inactive,Retired',
            ]);

            // Update the user model instances manually
            if (isset($validatedData['last_name'])) $admin->last_name = $validatedData['last_name'];
            if (isset($validatedData['first_name'])) $admin->first_name = $validatedData['first_name'];
            if (isset($validatedData['middle_name'])) $admin->middle_name = $validatedData['middle_name'];
            if (isset($validatedData['suffix_name'])) $admin->suffix_name = $validatedData['suffix_name'];
            if (isset($validatedData['code'])) $admin->code = $validatedData['code'];
            if (isset($validatedData['email'])) $admin->email = $validatedData['email'];
            if (isset($validatedData['role'])) $admin->role = $validatedData['role'];
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
                return response()->json(['message' => 'No changes detected'], 422);
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

        } catch (\Exception $e) {
            \Log::error('Admin update failed: ' . $e->getMessage(), [
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
    }
}