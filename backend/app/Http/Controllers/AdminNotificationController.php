<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminNotificationController extends Controller
{
    /**
     * Retrieve notifications for authenticated admin with optional pagination.
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $unreadCount = $user->unreadNotifications()->count();
        $readCount   = $user->readNotifications()->count();
        $totalCount  = $user->notifications()->count();

        // Compact response for the header notification bell
        if ($request->boolean('compact')) {
            return response()->json([
                'unread_count'  => $unreadCount,
                'notifications' => $user->notifications()->take(10)->get(),
            ]);
        }

        $query = $user->notifications();

        // Filter by read/unread status
        if ($request->filled('filter')) {
            $filter = $request->input('filter');

            if ($filter === 'unread') {
                $query->whereNull('read_at');
            } elseif ($filter === 'read') {
                $query->whereNotNull('read_at');
            }
        }

        // Search within notification payload data
        if ($request->filled('search')) {
            $search = $request->input('search');

            $query->where(function ($q) use ($search) {
                $q->where('data', 'like', "%{$search}%");
            });
        }

        $perPage   = (int) $request->input('per_page', 10);
        $paginated = $query->latest()->paginate($perPage);

        return response()->json([
            'unread_count'  => $unreadCount,
            'read_count'    => $readCount,
            'total_count'   => $totalCount,
            'notifications' => $paginated->items(),
            'total'         => $paginated->total(),
            'current_page'  => $paginated->currentPage(),
            'last_page'     => $paginated->lastPage(),
            'per_page'      => $paginated->perPage(),
        ]);
    }

    /**
     * Mark an individual notification as read.
     *
     * @param Request $request
     * @param string  $id
     * @return JsonResponse
     */
    public function markAsRead(Request $request, string $id): JsonResponse
    {
        $notification = $request->user()->notifications()->find($id);

        if ($notification) {
            $notification->markAsRead();
        }

        return response()->json(['message' => 'Marked as read']);
    }

    /**
     * Mark all unread notifications as read.
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function markAllAsRead(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications->markAsRead();

        return response()->json(['message' => 'All marked as read']);
    }

    /**
     * Delete an individual notification.
     *
     * @param Request $request
     * @param string  $id
     * @return JsonResponse
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $notification = $request->user()->notifications()->find($id);

        if (!$notification) {
            return response()->json([
                'message' => 'Notification not found'
            ], 404);
        }

        $notification->delete();

        return response()->json([
            'message' => 'Notification deleted successfully'
        ]);
    }

    /**
     * Mark multiple notifications as read.
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function bulkRead(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids'   => 'required|array',
            'ids.*' => 'string',
        ]);

        $request->user()
            ->unreadNotifications()
            ->whereIn('id', $validated['ids'])
            ->update(['read_at' => now()]);

        return response()->json([
            'message' => 'Selected notifications marked as read'
        ]);
    }

    /**
     * Delete multiple notifications.
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function bulkDelete(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids'   => 'required|array',
            'ids.*' => 'string',
        ]);

        $request->user()
            ->notifications()
            ->whereIn('id', $validated['ids'])
            ->delete();

        return response()->json([
            'message' => 'Selected notifications deleted successfully'
        ]);
    }

    /**
     * Clear all read notifications for the authenticated admin.
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function clearRead(Request $request): JsonResponse
    {
        $request->user()->readNotifications()->delete();

        return response()->json([
            'message' => 'Read notifications cleared successfully'
        ]);
    }

    /**
     * Clear all notifications for the authenticated admin.
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function clearAll(Request $request): JsonResponse
    {
        $request->user()->notifications()->delete();

        return response()->json([
            'message' => 'All notifications cleared'
        ]);
    }
}