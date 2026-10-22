<?php

namespace Tests\Feature;

use Tests\TestCase;

class SecurityHeadersTest extends TestCase
{
    /**
     * Test that global security response headers are present on responses.
     */
    public function test_security_headers_are_present_on_responses(): void
    {
        $response = $this->get('/');

        $response->assertStatus(200);

        $response->assertHeader('X-Frame-Options', 'SAMEORIGIN');
        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader(
            'Content-Security-Policy',
            "default-src 'none'; frame-ancestors 'self';"
        );
        $response->assertHeader(
            'Cross-Origin-Opener-Policy',
            'same-origin-allow-popups'
        );
        $response->assertHeader(
            'Cross-Origin-Embedder-Policy',
            'unsafe-none'
        );
        $response->assertHeader(
            'Referrer-Policy',
            'strict-origin-when-cross-origin'
        );

        $this->assertFalse(
            $response->headers->has('X-Powered-By'),
            'X-Powered-By header should be removed.'
        );
    }
}
