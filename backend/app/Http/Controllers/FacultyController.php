<?php

namespace App\Http\Controllers;

use App\Http\Controllers\WebhookController;
use App\Jobs\SendFacultyFirstLoginPasswordJob;
use App\Models\Faculty;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;

class FacultyController extends Controller
{
    protected $webhookController;

    public function __construct(WebhookController $webhookController)
    {
        $this->webhookController = $webhookController;
    }

    /**
     * GET all faculty users
     */
    public function index()
    {
        $users = User::with('faculty')->where('role', 'faculty')->get();
        return response()->json($users);
    }

    /**
     * CREATE new faculty account with optional faculty details
     */
    public function store(Request $request)
    {
        $validatedData = $request->validate([
            'first_name'      => 'required|string',
            'middle_name'     => 'nullable|string',
            'last_name'       => 'required|string',
            'suffix_name'     => 'nullable|string',
            'code'            => 'required|string|unique:users',
            'email'           => 'required|email|unique:users',
            'role'            => 'required|string',
            'status'          => 'required|string',
            'faculty_type_id' => 'required|exists:faculty_type,faculty_type_id',
            'password'        => 'required|string',
        ]);

        $user = User::create([
            'first_name'  => $validatedData['first_name'],
            'middle_name' => $validatedData['middle_name'],
            'last_name'   => $validatedData['last_name'],
            'suffix_name' => $validatedData['suffix_name'],
            'code'        => $validatedData['code'],
            'email'       => $validatedData['email'],
            'role'        => 'faculty',
            'status'      => $validatedData['status'],
            'password'    => $validatedData['password'],
        ]);

        $faculty = $user->faculty()->create([
            'faculty_type_id' => $validatedData['faculty_type_id'],
        ]);

        $facultyType = $faculty->facultyType;

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Faculty Created
        // ═══════════════════════════════════════════════════════
        AuditLogger::logCreate(
            model: 'Faculty',
            modelId: $faculty->id,
            data: array_merge($user->toArray(), ['faculty_type' => $facultyType->faculty_type]),
            description: "Created faculty account: {$user->formatted_name} ({$user->email})"
        );

        // Send email with password to faculty
        SendFacultyFirstLoginPasswordJob::dispatch($user, $validatedData['password']);

        // Send webhook to FESR about new faculty
        $facultyData = [
            'faculty_code'   => $validatedData['code'],
            'first_name'     => $validatedData['first_name'],
            'middle_name'    => $validatedData['middle_name'],
            'last_name'      => $validatedData['last_name'],
            'name_extension' => $validatedData['suffix_name'],
            'email'          => $validatedData['email'],
            'status'         => $validatedData['status'],
            'faculty_type'   => $facultyType->faculty_type,
        ];

        $this->webhookController->sendFacultyWebhook('faculty.created', $facultyData);

        return response()->json($user->load('faculty.facultyType'), 201);
    }

    /**
     * UPDATE existing faculty account and faculty details
     */
    public function update(Request $request, User $user)
    {
        if ($user->role !== 'faculty') {
            return response()->json(['message' => 'User is not a faculty member'], 400);
        }

        try {
            // ═══════════════════════════════════════════════════════
            // SAVE OLD DATA FOR DETAILED CHANGE TRACKING
            // ═══════════════════════════════════════════════════════
            $oldFacultyType = null;
            if ($user->faculty && $user->faculty->faculty_type_id) {
                try {
                    $oldFacultyTypeModel = \App\Models\FacultyType::find($user->faculty->faculty_type_id);
                    $oldFacultyType = $oldFacultyTypeModel ? $oldFacultyTypeModel->faculty_type : null;
                } catch (\Exception $e) {
                    \Log::warning("Could not load old faculty type: " . $e->getMessage());
                }
            }

            $oldData = [
                'first_name' => $user->first_name,
                'middle_name' => $user->middle_name,
                'last_name' => $user->last_name,
                'suffix_name' => $user->suffix_name,
                'email' => $user->email,
                'status' => $user->status,
                'faculty_type_id' => $user->faculty->faculty_type_id ?? null,
                'faculty_type' => $oldFacultyType,
            ];

            $validatedData = $request->validate([
                'first_name'      => 'required|string',
                'middle_name'     => 'nullable|string',
                'last_name'       => 'required|string',
                'suffix_name'     => 'nullable|string',
                'email'           => 'required|email',
                'status'          => 'required|string',
                'faculty_type_id' => 'required|exists:faculty_type,faculty_type_id',
                'password'        => 'nullable|string',
            ]);

            $user->update([
                'first_name'  => $validatedData['first_name'],
                'middle_name' => $validatedData['middle_name'],
                'last_name'   => $validatedData['last_name'],
                'suffix_name' => $validatedData['suffix_name'],
                'email'       => $validatedData['email'],
                'status'      => $validatedData['status'],
            ]);

            $user->faculty()->updateOrCreate(
                ['user_id' => $user->id],
                ['faculty_type_id' => $validatedData['faculty_type_id']]
            );

            // Reload faculty relationship
            $user->load('faculty.facultyType');
            $facultyType = $user->faculty->facultyType;

            // Handle password update
            if (isset($validatedData['password'])) {
                $user->update(['password' => $validatedData['password']]);
                
                AuditLogger::log(
                    action: 'update',
                    description: "Password changed for faculty: {$user->formatted_name}",
                    model: 'User',
                    modelId: $user->id,
                    metadata: ['action_type' => 'password_change']
                );
            }

            // ═══════════════════════════════════════════════════════
            // AUDIT LOG: DETAILED CHANGE TRACKING
            // ═══════════════════════════════════════════════════════
            $changes = [];

            if ($oldData['first_name'] != $user->first_name || 
                $oldData['middle_name'] != $user->middle_name || 
                $oldData['last_name'] != $user->last_name ||
                $oldData['suffix_name'] != $user->suffix_name) {
                $oldName = trim("{$oldData['first_name']} {$oldData['middle_name']} {$oldData['last_name']} {$oldData['suffix_name']}");
                $changes[] = "Name: {$oldName} → {$user->formatted_name}";
            }

            if ($oldData['email'] != $user->email) {
                $changes[] = "Email: {$oldData['email']} → {$user->email}";
            }

            if ($oldData['status'] != $user->status) {
                $changes[] = "Status: {$oldData['status']} → {$user->status}";
            }

            if ($oldData['faculty_type_id'] != $validatedData['faculty_type_id']) {
                $newType = $facultyType ? $facultyType->faculty_type : 'Unknown';
                $changes[] = "Faculty Type: {$oldData['faculty_type']} → {$newType}";
            }

            // Only log if there are actual changes
            if (count($changes) > 0) {
                $changesSummary = implode(', ', $changes);
                
                AuditLogger::logUpdate(
                    model: 'Faculty',
                    modelId: $user->faculty->id,
                    oldData: $oldData,
                    newData: [
                        'first_name' => $user->first_name,
                        'email' => $user->email,
                        'status' => $user->status,
                        'faculty_type_id' => $validatedData['faculty_type_id'],
                    ],
                    description: "Updated faculty: {$user->formatted_name} - {$changesSummary}"
                );
            }

            // Send webhook
            $facultyData = [
                'faculty_code'   => $user->code,
                'first_name'     => $validatedData['first_name'],
                'middle_name'    => $validatedData['middle_name'],
                'last_name'      => $validatedData['last_name'],
                'name_extension' => $validatedData['suffix_name'],
                'email'          => $validatedData['email'],
                'status'         => $validatedData['status'],
                'faculty_type'   => $facultyType ? $facultyType->faculty_type : 'Unknown',
            ];

            $this->webhookController->sendFacultyWebhook('faculty.updated', $facultyData);

            return response()->json($user->load('faculty.facultyType'));

        } catch (\Exception $e) {
            \Log::error('Faculty update failed: ' . $e->getMessage(), [
                'user_id' => $user->id,
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'message' => 'Failed to update faculty',
                'error' => config('app.debug') ? $e->getMessage() : 'An error occurred'
            ], 500);
        }
    }

    /**
     * DELETE a faculty user account
     */
    public function destroy(User $user)
    {
        if ($user->role !== 'faculty') {
            return response()->json(['message' => 'User is not a faculty member'], 400);
        }

        // ═══════════════════════════════════════════════════════
        // SAVE DATA FOR AUDIT BEFORE DELETION
        // ═══════════════════════════════════════════════════════
        $userData = array_merge(
            $user->toArray(),
            ['faculty_id' => $user->faculty->id ?? null]
        );

        if ($user->faculty) {
            $user->faculty->delete();
        }
        $user->delete();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Faculty Deleted
        // ═══════════════════════════════════════════════════════
        AuditLogger::logDelete(
            model: 'Faculty',
            modelId: $userData['faculty_id'] ?? 0,
            data: $userData,
            description: "Deleted faculty account: {$userData['first_name']} {$userData['last_name']} ({$userData['email']})"
        );

        return response()->json(null, 204);
    }

    /**
     * Retrieve detailed information for active faculty members.
     */
    public function getFacultyDetails()
    {
        $facultyDetails = Faculty::whereHas('user', function ($query) {
            $query->where('status', 'Active');
        })
            ->with(['user', 'facultyType'])
            ->get();

        $response = $facultyDetails->map(function ($faculty) {
            return [
                'faculty_id'    => $faculty->id,
                'name'          => $faculty->user->formatted_name ?? 'N/A',
                'code'          => $faculty->user->code ?? 'N/A',
                'faculty_email' => $faculty->user->email ?? 'N/A',
                'faculty_type'  => $faculty->facultyType->faculty_type ?? 'N/A',
                'faculty_units' => $faculty->faculty_units,
            ];
        })
            ->sortBy('name')
            ->values();

        return response()->json(['faculty' => $response], 200);
    }

}