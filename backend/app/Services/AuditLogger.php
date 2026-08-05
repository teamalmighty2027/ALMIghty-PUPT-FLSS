<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuditLogger
{
    /**
     * Log an action in the audit trail
     */
    public static function log(
        string $action,
        string $description,
        ?string $model = null,
        ?int $modelId = null,
        ?array $oldValues = null,
        ?array $newValues = null,
        ?array $metadata = null
    ): void {
        $user = Auth::user();
        $request = request();
        $url = $request?->fullUrl();

        // Safely truncate URL to fit database column limit
        if ($url && strlen($url) > 255) {
            $url = substr($url, 0, 255);
        }

        AuditLog::create([
            'user_id'     => $user?->id,
            'user_type'   => self::getUserType($user),
            'user_email'  => $user?->email,
            'user_name'   => self::getUserFullName($user),
            'action'      => $action,
            'model'       => $model,
            'model_id'    => $modelId,
            'description' => $description,
            'old_values'  => $oldValues,
            'new_values'  => $newValues,
            'metadata'    => $metadata,
            'ip_address'  => $request?->ip(),
            'user_agent'  => $request?->userAgent(),
            'url'         => $url,
            'method'      => $request?->method(),
        ]);
    }

    /**
     * Log login action
     */
    public static function logLogin(string $email): void
    {
        self::log(
            action: 'login',
            description: "User {$email} logged in",
            metadata: ['timestamp' => now()->toDateTimeString()]
        );
    }

    /**
     * Log failed login attempt for an inactive/retired user
     */
    public static function logFailedLogin(
        string $email,
        string $reason,
        $user = null
    ): void {
        self::log(
            action: 'login',
            description: "Failed login attempt for {$email} ({$reason})",
            model: 'User',
            modelId: $user?->id,
            metadata: [
                'reason' => $reason,
                'user_id' => $user?->id,
                'status' => $user?->status,
                'timestamp' => now()->toDateTimeString()
            ]
        );

        // Notify super admin of failed login attempts for inactive/retired
        \App\Services\SystemNoticeService::create(
            'audit_event',
            'warning',
            'backend',
            'Security Warning: Blocked Login',
            "Failed login attempt for account {$email} because it is {$reason}.",
            [
                'email' => $email,
                'status' => $user?->status,
                'reason' => $reason,
            ],
            $user?->id
        );
    }

    /**
     * Log a user status change (e.g. Active to Inactive or Retired)
     */
    public static function logStatusChange(
        $subject,
        string $oldStatus,
        string $newStatus
    ): void {
        self::log(
            action: 'update',
            description: "Changed status for {$subject->email}: {$oldStatus} -> {$newStatus}",
            model: 'User',
            modelId: $subject->id,
            oldValues: ['status' => $oldStatus],
            newValues: ['status' => $newStatus],
            metadata: [
                'user_id' => $subject->id,
                'old_status' => $oldStatus,
                'new_status' => $newStatus,
                'timestamp' => now()->toDateTimeString()
            ]
        );

        // Notify super admin of status changes
        \App\Services\SystemNoticeService::create(
            'audit_event',
            'info',
            'backend',
            'Account Status Changed',
            "Status for user {$subject->email} changed from {$oldStatus} to {$newStatus}.",
            [
                'user_id' => $subject->id,
                'old_status' => $oldStatus,
                'new_status' => $newStatus,
            ],
            $subject->id
        );
    }

    /**
     * Log logout action
     */
    public static function logLogout(): void
    {
        $user = Auth::user();
        self::log(
            action: 'logout',
            description: "User {$user?->email} logged out",
            metadata: ['timestamp' => now()->toDateTimeString()]
        );
    }

    /**
     * Log create action
     */
    public static function logCreate(string $model, int $modelId, array $data, string $description = null): void
    {
        self::log(
            action: 'create',
            description: $description ?? "Created {$model} #{$modelId}",
            model: $model,
            modelId: $modelId,
            newValues: $data
        );
    }

    /**
     * Log update action
     */
    public static function logUpdate(string $model, int $modelId, array $oldData, array $newData, string $description = null): void
    {
        self::log(
            action: 'update',
            description: $description ?? "Updated {$model} #{$modelId}",
            model: $model,
            modelId: $modelId,
            oldValues: $oldData,
            newValues: $newData
        );
    }

    /**
     * Log delete action
     */
    public static function logDelete(string $model, int $modelId, array $data, string $description = null): void
    {
        self::log(
            action: 'delete',
            description: $description ?? "Deleted {$model} #{$modelId}",
            model: $model,
            modelId: $modelId,
            oldValues: $data
        );
    }

    /**
     * Log view action
     */
    public static function logView(string $model, int $modelId, string $description = null): void
    {
        self::log(
            action: 'view',
            description: $description ?? "Viewed {$model} #{$modelId}",
            model: $model,
            modelId: $modelId
        );
    }

    /**
     * Get user type based on role
     */
    private static function getUserType($user): ?string
    {
        if (!$user) return null;
        
        if ($user->role === 'superadmin') return 'superadmin';
        if ($user->role === 'admin') return 'admin';
        
        // Check if user is faculty
        $faculty = \DB::table('faculty')->where('user_id', $user->id)->first();
        if ($faculty) return 'faculty';
        
        return 'user';
    }

    /**
     * Get user's full name
     */
    private static function getUserFullName($user): ?string
    {
        if (!$user) return null;
        
        return trim("{$user->first_name} {$user->middle_name} {$user->last_name}");
    }
}