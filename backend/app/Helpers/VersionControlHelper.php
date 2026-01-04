<?php

namespace App\Helpers;

use App\Models\VersionControl;
use Illuminate\Support\Facades\Auth;

class VersionControlHelper
{
    /**
     * Log a change to version control
     */
    public static function logChange(
        string $actionType,
        string $tableName,
        ?int $recordId,
        string $component,
        string $changesSummary,
        ?array $oldData = null,
        ?array $newData = null
    ) {
        $user = Auth::user();
        
        VersionControl::create([
            'user_id' => $user ? $user->id : null,
            'faculty_name' => $user ? $user->formatted_name : 'System',
            'action_type' => $actionType,
            'table_name' => $tableName,
            'record_id' => $recordId,
            'component' => $component,
            'changes_summary' => $changesSummary,
            'old_data' => $oldData,
            'new_data' => $newData,
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);
    }
}