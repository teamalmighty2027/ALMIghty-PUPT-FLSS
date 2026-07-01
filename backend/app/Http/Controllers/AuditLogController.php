<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    /**
     * Get all audit logs with filters (Paginated)
     * GET /api/audit-logs
     */
    public function index(Request $request): JsonResponse
    {
        $query = AuditLog::query()->orderBy('created_at', 'desc');
        
        // Filter by user
        if ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
        }
        
        // Filter by action
        if ($request->has('action')) {
            $query->where('action', $request->action);
        }
        
        // Filter by model
        if ($request->has('model')) {
            $query->where('model', $request->model);
        }
        
        // Filter by date range
        if ($request->has('start_date')) {
            $query->whereDate('created_at', '>=', $request->start_date);
        }
        
        if ($request->has('end_date')) {
            $query->whereDate('created_at', '<=', $request->end_date);
        }
        
        // Filter by user type
        if ($request->has('user_type')) {
            $query->where('user_type', $request->user_type);
        }
        
        // Get the requested page size, default to 10 if not provided
        $perPage = $request->input('per_page', 10);
        
        // Use paginate() instead of get()
        $logs = $query->paginate($perPage);
        
        return response()->json($logs);
    }
    /**
     * Get single audit log details
     * GET /api/audit-logs/{id}
     */
    public function show(int $id): JsonResponse
    {
        $log = AuditLog::findOrFail($id);
        return response()->json($log);
    }
    
    /**
     * Get audit logs for a specific user
     * GET /api/audit-logs/user/{userId}
     */
    public function getUserLogs(int $userId): JsonResponse
    {
        $logs = AuditLog::where('user_id', $userId)
            ->orderBy('created_at', 'desc')
            ->paginate(50);
        
        return response()->json($logs);
    }
    
    /**
     * Get audit logs for a specific model
     * GET /api/audit-logs/model/{model}/{modelId}
     */
    public function getModelLogs(string $model, int $modelId): JsonResponse
    {
        $logs = AuditLog::where('model', $model)
            ->where('model_id', $modelId)
            ->orderBy('created_at', 'desc')
            ->get();
        
        return response()->json($logs);
    }
    
    /**
     * Get recent activity (last 100 actions)
     * GET /api/audit-logs/recent
     */
    public function getRecentActivity(): JsonResponse
    {
        $logs = AuditLog::orderBy('created_at', 'desc')
            ->limit(100)
            ->get();
        
        return response()->json($logs);
    }
    
    /**
     * Get activity statistics
     * GET /api/audit-logs/statistics
     */
    public function getStatistics(Request $request): JsonResponse
    {
        $startDate = $request->input('start_date', now()->subDays(30));
        $endDate = $request->input('end_date', now());
        
        $stats = [
            'total_actions' => AuditLog::whereBetween('created_at', [$startDate, $endDate])->count(),
            'by_action' => AuditLog::whereBetween('created_at', [$startDate, $endDate])
                ->selectRaw('action, COUNT(*) as count')
                ->groupBy('action')
                ->get(),
            'by_user_type' => AuditLog::whereBetween('created_at', [$startDate, $endDate])
                ->selectRaw('user_type, COUNT(*) as count')
                ->groupBy('user_type')
                ->get(),
            'by_model' => AuditLog::whereBetween('created_at', [$startDate, $endDate])
                ->whereNotNull('model')
                ->selectRaw('model, COUNT(*) as count')
                ->groupBy('model')
                ->get(),
            'most_active_users' => AuditLog::whereBetween('created_at', [$startDate, $endDate])
                ->selectRaw('user_email, user_name, COUNT(*) as action_count')
                ->groupBy('user_email', 'user_name')
                ->orderByDesc('action_count')
                ->limit(10)
                ->get(),
        ];
        
        return response()->json($stats);
    }
}