<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckAdminPermission
{
    /**
     * Handle an incoming request.
     * 
     * Usage in routes:
     * Route::post('/schedule', [ScheduleController::class, 'assignSchedule'])
     *     ->middleware('auth:sanctum', 'permission:assign_schedules');
     * 
     * Multiple permissions (any):
     * ->middleware('permission:view_reports|edit_academic_years');
     * 
     * Multiple permissions (all):
     * ->middleware('permission:assign_schedules,edit_faculty_preferences');
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     * @param  string  $permissions - Permission key(s) separated by comma (all required) or pipe (any required)
     * @return \Symfony\Component\HttpFoundation\Response
     */
    public function handle(Request $request, Closure $next, string $permissions): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'message' => 'Unauthenticated.',
            ], 401);
        }

        // Superadmins always have all permissions
        if ($user->role === 'superadmin') {
            return $next($request);
        }

        // Check if any permission matches (pipe |)
        if (str_contains($permissions, '|')) {
            $permissionArray = array_map('trim', explode('|', $permissions));
            $hasPermission = false;

            foreach ($permissionArray as $permission) {
                if ($user->hasPermission($permission)) {
                    $hasPermission = true;
                    break;
                }
            }

            if (!$hasPermission) {
                return response()->json([
                    'message' => 'Insufficient permissions. Required one of: ' . implode(', ', $permissionArray),
                ], 403);
            }
        } else {
            // Check if all permissions are present (comma ,)
            $permissionArray = array_map('trim', explode(',', $permissions));

            foreach ($permissionArray as $permission) {
                if (!$user->hasPermission($permission)) {
                    return response()->json([
                        'message' => 'Insufficient permissions. Required: ' . implode(', ', $permissionArray),
                    ], 403);
                }
            }
        }

        return $next($request);
    }
}
