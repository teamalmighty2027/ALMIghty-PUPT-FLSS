<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    /**
     * Attaches protective security headers to outgoing HTTP responses.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        // Explicitly declare directives for API security and compliance
        $response->headers->set(
            'Content-Security-Policy',
            "default-src 'none'; " .
            "script-src 'none'; " .
            "style-src 'none'; " .
            "img-src 'none'; " .
            "connect-src 'none'; " .
            "frame-src 'none'; " .
            "font-src 'none'; " .
            "media-src 'none'; " .
            "object-src 'none'; " .
            "manifest-src 'none'; " .
            "worker-src 'none'; " .
            "frame-ancestors 'self';"
        );
        $response->headers->set(
            'Cross-Origin-Opener-Policy',
            'same-origin-allow-popups'
        );
        $response->headers->set(
            'Cross-Origin-Embedder-Policy',
            'unsafe-none'
        );
        $response->headers->set(
            'Referrer-Policy',
            'strict-origin-when-cross-origin'
        );

        $response->headers->remove('X-Powered-By');
        $response->headers->remove('Server');

        return $response;
    }
}
