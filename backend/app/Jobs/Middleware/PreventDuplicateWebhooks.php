<?php

namespace App\Jobs\Middleware;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * ⚠️ DEPRECATED: Prevent Duplicate Webhooks Middleware
 * 
 * This middleware prevents duplicate webhook processing by tracking processed webhook IDs.
 * 
 * @deprecated The webhook integration is deprecated and will be removed.
 *             Do NOT use this middleware for new jobs.
 *             TODO: Replace with new idempotency mechanism in event system.
 */
class PreventDuplicateWebhooks
{
    protected $key;

    public function __construct(string $key)
    {
        $this->key = $key;
    }

    public function handle($job, $next)
    {
        if (Cache::has($this->key)) {
            Log::info('Skipping duplicate webhook job', [
                'key' => $this->key,
            ]);
            return;
        }

        // Process the job
        $next($job);
    }
}
