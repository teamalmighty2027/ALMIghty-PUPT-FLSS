<?php

namespace App\Http\Middleware;

use Carbon\Carbon;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class TokenExpirationMiddleware
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return $next($request);
        }

        $accessToken = $user->currentAccessToken();

        if (! $accessToken ||
            $accessToken instanceof \Laravel\Sanctum\TransientToken) {
            return $next($request);
        }

        if (! $accessToken->expires_at) {
            return $next($request);
        }

        if (Carbon::now()->greaterThan($accessToken->expires_at)) {
            $accessToken->delete();

            return response()->json([
                'message' => 'Token expired.',
            ], 401);
        }

        return $next($request);
    }
}
