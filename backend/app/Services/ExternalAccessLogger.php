<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class ExternalAccessLogger
{
    /**
     * Cooldown duration for database audit log entries (in minutes).
     */
    public const AUDIT_COOLDOWN_MINUTES = 60;

    /**
     * Cooldown duration for laravel.log file entries (in minutes).
     */
    public const LOG_COOLDOWN_MINUTES = 10;

    /**
     * Cache key prefix for external access logging rate-limiting.
     */
    private const CACHE_PREFIX = 'ext_access';

    /**
     * Logs external system access with independent throttling for
     * laravel.log and database audit logs.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  string  $resource
     * @return string  The resolved client system identifier
     */
    public static function log(
        Request $request,
        string $resource
    ): string {
        $clientSystem = $request->attributes->get(
            'client_system',
            'Unknown System'
        );

        $systemSlug = Str::slug($clientSystem);
        $resourceSlug = Str::slug($resource);

        self::handleLaravelLog(
            $request,
            $resource,
            $clientSystem,
            $systemSlug,
            $resourceSlug
        );

        self::handleAuditLog(
            $resource,
            $clientSystem,
            $systemSlug,
            $resourceSlug
        );

        return $clientSystem;
    }

    /**
     * Records an entry in laravel.log if the 10-minute cooldown
     * window has elapsed, tracking suppressed request counts.
     */
    private static function handleLaravelLog(
        Request $request,
        string $resource,
        string $clientSystem,
        string $systemSlug,
        string $resourceSlug
    ): void {
        $logKey = sprintf(
            '%s:log:%s:%s',
            self::CACHE_PREFIX,
            $systemSlug,
            $resourceSlug
        );

        $counterKey = sprintf(
            '%s:count:%s:%s',
            self::CACHE_PREFIX,
            $systemSlug,
            $resourceSlug
        );

        $shouldLog = Cache::add(
            $logKey,
            true,
            now()->addMinutes(self::LOG_COOLDOWN_MINUTES)
        );

        if ($shouldLog) {
            $suppressedCount = (int) Cache::pull($counterKey, 0);

            $context = ['ip' => $request->ip()];

            if ($suppressedCount > 0) {
                $context['suppressed_requests'] = $suppressedCount;
            }

            Log::info(
                "{$resource} accessed by external system: {$clientSystem}",
                $context
            );
        } else {
            if (Cache::has($counterKey)) {
                Cache::increment($counterKey);
            } else {
                Cache::put(
                    $counterKey,
                    1,
                    now()->addMinutes(self::LOG_COOLDOWN_MINUTES * 2)
                );
            }
        }
    }

    /**
     * Records an entry in audit_logs if the 1-hour cooldown
     * window has elapsed.
     */
    private static function handleAuditLog(
        string $resource,
        string $clientSystem,
        string $systemSlug,
        string $resourceSlug
    ): void {
        $auditKey = sprintf(
            '%s:audit:%s:%s',
            self::CACHE_PREFIX,
            $systemSlug,
            $resourceSlug
        );

        $shouldAudit = Cache::add(
            $auditKey,
            true,
            now()->addMinutes(self::AUDIT_COOLDOWN_MINUTES)
        );

        if ($shouldAudit) {
            AuditLogger::log(
                action: 'view',
                description: "{$resource} accessed by external system: " .
                    $clientSystem,
                metadata: ['client_system' => $clientSystem]
            );
        }
    }
}
