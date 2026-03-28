<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class AdminAccessBuilder
{
    /**
     * Filter a programs query by admin's allowed programs.
     * If admin has no program restrictions, returns query as-is.
     * Otherwise, filters to allowed program IDs.
     * 
     * @param User $admin
     * @param Builder $query
     * @param string $programIdColumn Column name in query (default: 'program_id')
     * @return Builder
     */
    public static function filterProgramsByAdminAccess(
        User $admin,
        Builder $query,
        string $programIdColumn = 'program_id'
    ): Builder {
        // Superadmins and users with full access see all programs
        if ($admin->isFullAccess()) {
            return $query;
        }

        // Filter to allowed program IDs
        $allowedProgramIds = $admin->getAllowedProgramIds();
        return $query->whereIn($programIdColumn, $allowedProgramIds);
    }

    /**
     * Filter a schedules query by admin's allowed programs.
     * 
     * @param User $admin
     * @param Builder $query
     * @return Builder
     */
    public static function filterSchedulesByAdminAccess(User $admin, Builder $query): Builder
    {
        // Superadmins and users with full access see all schedules
        if ($admin->isFullAccess()) {
            return $query;
        }

        $allowedProgramIds = $admin->getAllowedProgramIds();

        return $query->whereIn('program_id', $allowedProgramIds);
    }

    /**
     * Filter a preferences query by admin's allowed programs.     
     * 
     * @param User $admin
     * @param Builder $query
     * @return Builder
     */
    public static function filterPreferencesByAdminAccess(User $admin, Builder $query): Builder
    {
        if ($admin->isFullAccess()) {
            return $query;
        }

        $allowedProgramIds = $admin->getAllowedProgramIds();

        // Preferences are connected to programs through course_assignments or section courses
        return $query->whereIn('program_id', function ($subquery) use ($allowedProgramIds) {
            $subquery->select('program_id')
                ->from('program_year_level_curricula')
                ->whereIn('program_id', $allowedProgramIds)
                ->distinct();
        return $query->whereIn('program_id', $allowedProgramIds);
     * @param User $admin
     * @param Builder $query
     * @return Builder
     */
    public static function filterCoursesByAdminAccess(User $admin, Builder $query): Builder
    {
        if ($admin->isFullAccess()) {
            return $query;
        }

        $allowedProgramIds = $admin->getAllowedProgramIds();

        // Courses are connected to programs through curricula
        return $query->whereIn('curriculum_id', function ($subquery) use ($allowedProgramIds) {
            $subquery->select('curriculum_id')
                ->from('curricula_program')
                ->whereIn('program_id', $allowedProgramIds)
                ->distinct();
        });
    }

    /**
     * Get allowed program IDs for an admin, eager-loading to avoid N+1.
     * Returns empty array if admin has full access (all programs allowed).
     * 
     * @param User $admin
     * @return array
     */
    public static function getAllowedProgramIds(User $admin): array
    {
        if ($admin->isFullAccess()) {
            return [];
        }
        return $admin->getAllowedProgramIds();
    }

    /**
     * Check if an admin can access a specific program.
     * 
     * @param User $admin
     * @param int|string $programId
     * @return bool
     */
    public static function canAccessProgram(User $admin, $programId): bool
    {
        if ($admin->isFullAccess()) {
            return true;
        }

        return in_array($programId, $admin->getAllowedProgramIds());
    }
}
