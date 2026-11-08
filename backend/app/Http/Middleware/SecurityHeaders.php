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
        $response->headers->set(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains'
        );
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
            "frame-ancestors 'self'; " .
            "form-action 'none'; " .
            "base-uri 'none';"
        );
        $response->headers->set(
            'Permissions-Policy',
            'camera=(), microphone=(), geolocation=()'
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
