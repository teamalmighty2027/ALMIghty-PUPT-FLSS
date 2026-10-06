<?php

namespace App\Http\Controllers;

use App\Models\SystemNotice;
use App\Models\User;
use App\Services\SystemNoticeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

// Manages system notices — operational events, errors, and security alerts
// visible only to the Super Admin. Includes a separate endpoint for
// authenticated frontend clients to report errors.
class SystemNoticeController extends Controller
{
    /**
     * List all system notices with optional filters (superadmin only).
     * GET /api/system-notices
     */
    public function index(Request $request): JsonResponse
    {
        $query = SystemNotice::query()->orderBy('created_at', 'desc');

        // Filter by notice type
        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        // Filter by severity level
        if ($request->filled('severity')) {
            $query->where('severity', $request->severity);
        }

        // Filter by resolution status
        if ($request->filled('resolved')) {
            if ($request->boolean('resolved')) {
                $query->whereNotNull('resolved_at');
            } else {
                $query->whereNull('resolved_at');
            }
        }

        // Filter by source (frontend|backend)
        if ($request->filled('source')) {
            $query->where('source', $request->source);
        }

        // Date range filters
        if ($request->filled('start_date')) {
            $query->whereDate('created_at', '>=', $request->start_date);
        }

        if ($request->filled('end_date')) {
            $query->whereDate('created_at', '<=', $request->end_date);
        }

        $perPage = $request->input('per_page', 15);
        $notices = $query->paginate($perPage);

        return response()->json($notices);
    }

    /**
     * Get a single system notice with full context (superadmin only).
     * GET /api/system-notices/{id}
     */
    public function show(int $id): JsonResponse
    {
        $notice = SystemNotice::findOrFail($id);
        return response()->json($notice);
    }

    /**
     * Manually create a notice from the superadmin panel.
     * POST /api/system-notices
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type'     => 'required|string|max:64',
            'severity' => 'required|in:info,warning,error,critical',
            'source'   => 'required|in:frontend,backend',
            'title'    => 'required|string|max:255',
            'message'  => 'required|string|max:5000',
            'context'  => 'nullable|array',
        ]);

        $notice = SystemNoticeService::create(
            $validated['type'],
            $validated['severity'],
            $validated['source'],
            $validated['title'],
            $validated['message'],
            $validated['context'] ?? []
        );

        return response()->json($notice, 201);
    }

    /**
     * Mark a notice as resolved (superadmin only).
     * PATCH /api/system-notices/{id}/resolve
     */
    public function resolve(int $id): JsonResponse
    {
        $notice = SystemNotice::findOrFail($id);

        if ($notice->resolved_at !== null) {
            return response()->json([
                'message' => 'Notice is already resolved.',
            ], 422);
        }

        SystemNoticeService::resolve($id, Auth::id());

        return response()->json([
            'message' => 'Notice marked as resolved.',
        ]);
    }

    /**
     * Bulk-resolve multiple notices in one request (superadmin only).
     * PATCH /api/system-notices/bulk-resolve
     */
    public function bulkResolve(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids'   => 'required|array|min:1',
            'ids.*' => 'required|integer|exists:system_notices,id',
        ]);

        $updated = SystemNoticeService::bulkResolve(
            $validated['ids'],
            Auth::id()
        );

        return response()->json([
            'message' => "{$updated} notice(s) marked as resolved.",
            'updated' => $updated,
        ]);
    }

    /**
     * Count unresolved actionable (error/critical) notices for sidebar badge.
     * GET /api/system-notices/unresolved-count
     */
    public function unresolvedCount(): JsonResponse
    {
        $count = SystemNotice::unresolved()->actionable()->count();
        return response()->json(['count' => $count]);
    }

    /**
     * Receive an error report from the frontend client.
     */
    public function storeFromFrontend(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type'              => 'nullable|string|max:64',
            'severity'          => 'required|in:info,warning,error,critical',
            'title'             => 'required|string|max:255',
            'message'           => 'required|string|max:5000',
            'context'           => 'nullable|array',
            'context.stack'     => 'nullable|string|max:10000',
            'context.route'     => 'nullable|string|max:500',
            'context.timestamp' => 'nullable|string',
        ]);

        $type = $validated['type'] ?? 'frontend_error';

        SystemNoticeService::create(
            $type,
            $validated['severity'],
            'frontend',
            $validated['title'],
            $validated['message'],
            $validated['context'] ?? [],
            Auth::id()
        );

        return response()->json(['message' => 'Report received.'], 202);
    }
}
