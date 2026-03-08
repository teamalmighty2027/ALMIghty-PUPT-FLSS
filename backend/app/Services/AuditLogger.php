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
            'url'         => $request?->fullUrl(),
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