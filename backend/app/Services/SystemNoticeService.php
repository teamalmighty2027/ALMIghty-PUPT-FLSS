<?php

namespace App\Services;

use App\Models\SystemNotice;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

// Central service for creating, enriching, and resolving system notices.
// All callers (AuditLogger, controllers, commands) should go through here.
class SystemNoticeService
{
    // Valid severity levels matching the DB enum
    private const SEVERITY_MAP = [
        'info'     => 'info',
        'warning'  => 'warning',
        'error'    => 'error',
        'critical' => 'critical',
    ];

    // ── Public API ───────────────────────────────────────────────────

    /**
     * Create a new system notice, persist to DB, and write to log file.
     *
     * @param  string      $type     Category (frontend_error, audit_event, etc.)
     * @param  string      $severity info|warning|error|critical
     * @param  string      $source   frontend|backend
     * @param  string      $title    Short summary (≤255 chars)
     * @param  string      $message  Full description
     * @param  array       $context  Extra data: stack, route, user info, etc.
     * @param  int|null    $userId   Originating user ID (null for system events)
     * @return SystemNotice
     */
    public static function create(
        string  $type,
        string  $severity,
        string  $source,
        string  $title,
        string  $message,
        array   $context = [],
        ?int    $userId = null
    ): SystemNotice {

        // Resolve current authenticated user if not explicitly provided
        if ($userId === null && Auth::check()) {
            $userId = Auth::id();
        }

        // Enrich context with audit-log-style server metadata
        $enrichedContext = array_merge(
            $context,
            self::buildServerContext($userId)
        );

        $notice = SystemNotice::create([
            'type'     => $type,
            'severity' => self::SEVERITY_MAP[$severity] ?? 'info',
            'source'   => $source,
            'title'    => substr($title, 0, 255),
            'message'  => $message,
            'context'  => $enrichedContext,
            'user_id'  => $userId,
        ]);

        self::writeToLog($notice, $enrichedContext);

        return $notice;
    }

    /**
     * Mark a notice as resolved by the given superadmin.
     */
    public static function resolve(int $noticeId, int $resolvedBy): void
    {
        SystemNotice::where('id', $noticeId)
            ->whereNull('resolved_at')
            ->update([
                'resolved_at' => now(),
                'resolved_by' => $resolvedBy,
            ]);
    }

    /**
     * Convenience wrapper for backend audit security events.
     */
    public static function auditEvent(
        string $title,
        string $message,
        array  $context = [],
        ?int   $userId = null
    ): SystemNotice {
        return self::create(
            'audit_event',
            'warning',
            'backend',
            $title,
            $message,
            $context,
            $userId
        );
    }

    /**
     * Convenience wrapper for backend exception notices.
     */
    public static function backendError(
        string $title,
        string $message,
        array  $context = []
    ): SystemNotice {
        return self::create(
            'backend_exception',
            'error',
            'backend',
            $title,
            $message,
            $context
        );
    }

    // ── Private Helpers ──────────────────────────────────────────────

    /**
     * Build server-side audit metadata to merge into context.
     */
    private static function buildServerContext(?int $userId): array
    {
        $request  = request();
        $authUser = $userId
            ? User::find($userId)
            : Auth::user();

        $userName = null;

        if ($authUser) {
            $parts    = array_filter([
                $authUser->first_name,
                $authUser->middle_name,
                $authUser->last_name,
            ]);
            $userName = trim(implode(' ', $parts));
        }

        return [
            'audit_info' => [
                'user_id'          => $authUser?->id,
                'user_name'        => $userName,
                'user_role'        => $authUser?->role,
                'ip_address'       => $request?->ip(),
                'user_agent'       => $request?->userAgent(),
                'server_timestamp' => now()->toIso8601String(),
            ],
        ];
    }

    /**
     * Write a structured entry to the dedicated system-notices log channel.
     */
    private static function writeToLog(
        SystemNotice $notice,
        array        $context
    ): void {
        $auditInfo = $context['audit_info'] ?? [];

        $logMessage = sprintf(
            '[%s] type=%s  user="%s (%s)"  ip=%s  route=%s',
            $notice->title,
            $notice->type,
            $auditInfo['user_name'] ?? 'system',
            $auditInfo['user_role'] ?? 'n/a',
            $auditInfo['ip_address'] ?? 'unknown',
            $context['route'] ?? 'n/a'
        );

        $level = $notice->severity;

        Log::channel('system_notice')->{$level}($logMessage, [
            'notice_id' => $notice->id,
            'message'   => $notice->message,
            'stack'     => $context['stack'] ?? null,
        ]);
    }
}
