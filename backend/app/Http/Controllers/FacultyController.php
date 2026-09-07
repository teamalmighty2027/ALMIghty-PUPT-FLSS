<?php

namespace App\Http\Controllers;

use App\Models\Faculty;
use App\Models\User;
use App\Models\UserProfile;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use App\Services\FacultyDataService;
use App\Services\IdpSyncService;
use App\Notifications\FacultyStatusChangedNotification;
use App\Notifications\FacultyReactivationRequestNotification;
use Illuminate\Support\Facades\Notification;
use App\Jobs\RegisterUserToIdpJob;
use App\Jobs\SendFacultyFirstLoginPasswordJob;
use Illuminate\Validation\Rules\Password;

class FacultyController extends Controller
{

    /**
     * GET all faculty users
     */
    public function index()
    {
        $users = User::with('faculty')->where('role', 'faculty')->get();
        return response()->json($users);
    }

    /**
     * GET a suggested faculty code
     */
    public function suggestCode()
    {
        $year = date('Y');
        $prefix = 'FA';
        $suffix = "TG{$year}";

        // Find the most recently added faculty user by ID
        $lastCode = User::where('role', 'faculty')
            ->where('code', 'LIKE', "{$prefix}%")
            ->orderBy('id', 'desc')
            ->first();

        $nextNumber = 1;

        if ($lastCode) {
            // Extract the number following the prefix FA
            $pattern = '/^' . preg_quote($prefix) . '(\d+)/';
            if (preg_match($pattern, $lastCode->code, $matches)) {
                $nextNumber = (int)$matches[1] + 1;
            }
        }

        // Pad with at least 4 zeroes (or more if the number is large)
        $paddedNumber = str_pad($nextNumber, 4, '0', STR_PAD_LEFT);
        $suggestedCode = "{$prefix}{$paddedNumber}{$suffix}";

        return response()->json(['suggested_code' => $suggestedCode]);
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
            'password'        => [
                'required',
                'string',
                Password::min(12)
                    ->mixedCase()
                    ->numbers()
                    ->symbols(),
            ],
        ]);

        DB::beginTransaction();
        try {
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
            UserProfile::create([
                'user_id' => $user->id,
                'house_num' => null,
                'street' => null,
                'barangay' => null,
                'city' => null,
                'province' => null,
                'country' => null,
                'zipcode' => null,
                'birthdate' => null,
                'sex' => null,
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

            DB::commit();

            // Background jobs for external services
            SendFacultyFirstLoginPasswordJob::dispatch($user, $validatedData['password']);
            RegisterUserToIdpJob::dispatch($user, $validatedData['password']);

            return response()->json($user->load('faculty.facultyType'), 201);
        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('Faculty creation failed: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json([
                'message' => 'Failed to create faculty',
                'error' => config('app.debug') ? $e->getMessage() : 'An error occurred'
            ], 500);
        }
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
                    Log::warning("Could not load old faculty type: " . $e->getMessage());
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
                'password'        => [
                    'sometimes',
                    'nullable',
                    'string',
                    Password::min(12)
                        ->mixedCase()
                        ->numbers()
                        ->symbols(),
                ],
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

                // Revoke tokens and log status change
                $user->tokens()->delete();
                AuditLogger::logStatusChange(
                    $user,
                    $oldData['status'],
                    $user->status
                );

                $facultyDataService = app(FacultyDataService::class);
                $idpSyncService = app(IdpSyncService::class);

                if ($user->status === 'Inactive') {
                    $facultyDataService->scrubInactive($user);
                    $idpSyncService->syncUserToIdp(
                        $user,
                        ['status' => 'Inactive']
                    );
                } elseif ($user->status === 'Retired') {
                    $facultyDataService->scrubRetired($user);
                    $idpSyncService->deleteUserFromIdp($user);
                }

                // Notify superadmin users of status changes
                $superAdmins = User::where('role', 'superadmin')->get();
                if ($superAdmins->isNotEmpty()) {
                    Notification::send(
                        $superAdmins,
                        new FacultyStatusChangedNotification(
                            $user,
                            $oldData['status'],
                            $user->status
                        )
                    );
                }
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

            return response()->json($user->load('faculty.facultyType'));

        } catch (\Exception $e) {
            Log::error('Faculty update failed: ' . $e->getMessage(), [
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

    /**
     * Public endpoint for inactive faculty to request account reactivation.
     */
    public function requestReactivation(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $user = User::where('email', $request->email)
            ->where('role', 'faculty')
            ->where('status', 'Inactive')
            ->first();

        if ($user && $user->faculty) {
            $user->faculty->update([
                'has_reactivation_request' => true,
            ]);

            // Reactivation requests are managed exclusively by the Super Admin
            $superAdmins = User::where('role', 'superadmin')->get();
            if ($superAdmins->isNotEmpty()) {
                Notification::send(
                    $superAdmins,
                    new FacultyReactivationRequestNotification($user)
                );
            }

            // Create a trace notice in SystemNoticeService
            \App\Services\SystemNoticeService::create(
                'reactivation_request',
                'info',
                'backend',
                'Reactivation Request Submitted',
                "Faculty {$user->last_name}, {$user->first_name} is requesting account reactivation.",
                [
                    'email' => $user->email,
                    'faculty_code' => $user->code,
                ],
                $user->id
            );
        }

        return response()->json([
            'message' => 'If an inactive account exists with this email, ' . 
                'a reactivation request has been submitted to administrators.',
        ], 202);
    }

    /**
     * Admin endpoint to approve reactivation request and restore Active status.
     */
    public function approveReactivation(Request $request, User $user)
    {
        if ($user->role !== 'faculty') {
            return response()->json([
                'message' => 'User is not a faculty member.',
            ], 400);
        }

        if ($user->status !== 'Inactive') {
            return response()->json([
                'message' => 'Only inactive faculty accounts can be reactivated.',
            ], 400);
        }

        $user->update([
            'status' => 'Active',
        ]);

        if ($user->faculty) {
            $user->faculty->update([
                'has_reactivation_request' => false,
            ]);
        }

        // Resolve any pending reactivation system notices for this user
        $pendingNotices = \App\Models\SystemNotice::where('user_id', $user->id)
            ->where('type', 'reactivation_request')
            ->whereNull('resolved_at')
            ->get();

        foreach ($pendingNotices as $notice) {
            \App\Services\SystemNoticeService::resolve($notice->id, auth()->id());
        }

        AuditLogger::logStatusChange($user, 'Inactive', 'Active');

        return response()->json([
            'message' => 'Faculty account reactivated successfully.',
            'user'    => $user->load('faculty.facultyType'),
        ]);
    }

    /**
     * Syncs faculty IDP user UUIDs from external IDP system.
     * Accessible only to superadmin accounts.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function syncIdpUuids(Request $request)
    {
        // Enforce superadmin role restriction
        if ($request->user()?->role !== 'superadmin') {
            return response()->json([
                'message' => 'Unauthorized. Superadmin access required.'
            ], 403);
        }

        $token = $request->input('idp_access_token')
            ?? $request->cookie('access_token');

        if (empty($token)) {
            return response()->json([
                'message' => 'IDP access token is missing.'
            ], 400);
        }

        $baseUrl = config('services.idp.base_url')
            ?? 'https://identity-provider.isaxbsit2027.com';

        $domain = parse_url($baseUrl, PHP_URL_HOST)
            ?? 'identity-provider.isaxbsit2027.com';

        // Query all faculty users missing idp_user_id
        $faculties = Faculty::join('users', 'faculty.user_id', '=', 'users.id')
            ->select(
                'faculty.id as faculty_id',
                'users.email',
                'faculty.idp_user_id'
            )
            ->get();

        $emailsToSync = [];

        foreach ($faculties as $fac) {
            if (empty($fac->idp_user_id)) {
                $emailsToSync[strtolower($fac->email)] = $fac;
            }
        }

        $missingCount = count($emailsToSync);

        if ($missingCount === 0) {
            return response()->json([
                'message'       => 'All faculties already have IDP user IDs.',
                'matched'       => 0,
                'total_missing' => 0,
            ], 200);
        }

        $page = 1;
        $limit = 100;
        $matched = 0;

        while (true) {
            $response = Http::withoutVerifying()
                ->withCookies(['access_token' => $token], $domain)
                ->get(rtrim($baseUrl, '/') . '/api/v1/admin/users', [
                    'page'  => $page,
                    'limit' => $limit,
                ]);

            if (! $response->successful()) {
                Log::warning('IDP users fetch failed on page ' . $page, [
                    'status' => $response->status(),
                    'body'   => $response->body(),
                ]);
                break;
            }

            $data = $response->json();
            $usersList = [];

            if (isset($data['data']) && is_array($data['data'])) {
                $usersList = $data['data'];
            } elseif (isset($data['users']) && is_array($data['users'])) {
                $usersList = $data['users'];
            } elseif (is_array($data)) {
                $usersList = $data;
            }

            if (empty($usersList)) {
                break;
            }

            foreach ($usersList as $idpUser) {
                if (! isset($idpUser['email']) || ! isset($idpUser['id'])) {
                    continue;
                }

                $idpEmail = strtolower($idpUser['email']);
                $idpId = $idpUser['id'];

                if (isset($emailsToSync[$idpEmail])) {
                    $fac = $emailsToSync[$idpEmail];
                    $matched++;

                    Faculty::where('id', $fac->faculty_id)->update([
                        'idp_user_id' => $idpId,
                    ]);
                }
            }

            if (count($usersList) < $limit) {
                break;
            }

            $page++;
        }

        return response()->json([
            'message'       => 'IDP UUID sync completed successfully.',
            'matched'       => $matched,
            'total_missing' => $missingCount,
        ], 200);
    }
}