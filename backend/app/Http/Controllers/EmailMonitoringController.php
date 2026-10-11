<?php

namespace App\Http\Controllers;

use App\Models\EmailDispatchLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class EmailMonitoringController extends Controller
{
    /**
     * Get paginated email dispatch logs with optional status, purpose,
     * search, and date filters.
     *
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function getEmailLogs(Request $request)
    {
        $query = EmailDispatchLog::query()
            ->with(['faculty.user'])
            ->orderBy('dispatched_at', 'desc');

        // Filter by status (queued, sent, failed)
        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        // Filter by purpose
        if ($request->filled('purpose') && $request->purpose !== 'all') {
            $query->where('purpose', $request->purpose);
        }

        // Filter by date (YYYY-MM-DD)
        if ($request->filled('date')) {
            $query->whereDate('dispatched_at', $request->date);
        }

        // Search by email or recipient name
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('recipient_email', 'like', "%{$search}%")
                  ->orWhere('recipient_name', 'like', "%{$search}%");
            });
        }

        $perPage = $request->input('per_page', 15);
        $logs = $query->paginate($perPage);

        return response()->json($logs);
    }

    /**
     * Get aggregate metrics for email dispatches (queued, sent, failed).
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function getEmailMetrics()
    {
        $metrics = EmailDispatchLog::select(
            DB::raw("COUNT(CASE WHEN status = 'queued' THEN 1 END) as queued"),
            DB::raw("COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent"),
            DB::raw("COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed")
        )->first();

        return response()->json([
            'queued' => (int) ($metrics->queued ?? 0),
            'sent'   => (int) ($metrics->sent ?? 0),
            'failed' => (int) ($metrics->failed ?? 0),
        ]);
    }
}
