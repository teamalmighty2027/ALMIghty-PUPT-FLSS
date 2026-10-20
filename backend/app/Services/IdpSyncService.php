<?php

namespace App\Services;

use App\Jobs\UpdateUserEmailIdpJob;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Support\Facades\Log;

class IdpSyncService
{
    /**
     * Reusable function to edit/sync user details with external IDP.
     * Handles updating email via queued background retry job.
     *
     * @param User $user
     * @param array $options
     * @return bool
     */
    public function syncUserToIdp(User $user, array $options = []): bool
    {
        $newEmail = $options['email'] ?? $user->email;
        $oldEmail = $options['old_email'] ?? null;

        // Resolve IDP user UUID
        $uuid = $options['uuid']
            ?? $options['idp_user_id']
            ?? $user->faculty?->idp_user_id
            ?? $user->faculty()->value('idp_user_id');

        if (empty($uuid)) {
            Log::warning(
                "IDP Sync: Missing IDP UUID for user {$user->id}.",
                ['user_id' => $user->id, 'options' => $options]
            );

            AuditLogger::log(
                action: 'update',
                description: "Skipped IDP email sync for user {$user->id}: " .
                    "Missing IDP UUID",
                model: 'User',
                modelId: $user->id,
                metadata: [
                    'reason' => 'missing_idp_uuid',
                    'email'  => $newEmail,
                ]
            );

            return false;
        }

        $token = $options['token']
            ?? request()?->bearerToken()
            ?? request()?->cookie('access_token');

        // Allow synchronous dispatch if requested (e.g., testing or CLI)
        if (!empty($options['sync'])) {
            UpdateUserEmailIdpJob::dispatchSync(
                $user,
                $uuid,
                $newEmail,
                $oldEmail,
                $token
            );
        } else {
            UpdateUserEmailIdpJob::dispatch(
                $user,
                $uuid,
                $newEmail,
                $oldEmail,
                $token
            );
        }

        Log::info(
            "Dispatched IDP email update job for user {$user->id}",
            [
                'user_id'  => $user->id,
                'idp_uuid' => $uuid,
                'email'    => $newEmail,
            ]
        );

        return true;
    }

    /**
     * Placeholder function to delete a user account from external IDP.
     * Triggered when a faculty user's status is set to Retired.
     *
     * @param User $user
     * @return bool
     */
    public function deleteUserFromIdp(User $user): bool
    {
        Log::info("IDP Sync Placeholder: User {$user->id} deleted from IDP.");

        return true;
    }
}
