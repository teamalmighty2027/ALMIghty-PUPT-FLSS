<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class SuperAdminMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        if (auth('sanctum')->check() && auth('sanctum')->user()->role === 'superadmin') {
            return $next($request);
        }

        return response()->json(['error' => 'Access denied. Super admin privileges required.'], 403);
    }
}
