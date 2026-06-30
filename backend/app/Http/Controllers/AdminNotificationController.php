<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class AdminNotificationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        
        return response()->json([
            'unread_count' => $user->unreadNotifications()->count(),
            // Fetch the 10 most recent notifications
            'notifications' => $user->notifications()->take(10)->get() 
        ]);
    }

    public function markAsRead(Request $request, $id)
    {
        $notification = $request->user()->notifications()->find($id);
        if ($notification) {
            $notification->markAsRead();
        }
        return response()->json(['message' => 'Marked as read']);
    }

    public function markAllAsRead(Request $request)
    {
        $request->user()->unreadNotifications->markAsRead();
        return response()->json(['message' => 'All marked as read']);
    }

    public function clearAll(Request $request)
    {
        // Deletes all notifications for the authenticated admin
        $request->user()->notifications()->delete();
        return response()->json(['message' => 'All notifications cleared']);
    }
}