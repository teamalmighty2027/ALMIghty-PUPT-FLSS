<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Log;

class IdpSyncService
{
    /**
     * Reusable function to edit/sync user details with external IDP.
     * Handles updating name, email, or active/inactive status.
     *
     * @param User $user
     * @param array $options
     * @return bool
     */
    public function syncUserToIdp(User $user, array $options = []): bool
    {
        Log::info("IDP Sync Placeholder: User {$user->id} updated.", [
            'status' => $user->status,
            'options' => $options,
        ]);

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
