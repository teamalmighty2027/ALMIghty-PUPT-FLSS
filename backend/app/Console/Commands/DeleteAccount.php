<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class DeleteAccount extends Command
{
    protected $signature = 'user:delete-account
        {email : Email of the account to delete}
        {--role= : Optional role filter: faculty|admin}
        {--force : Skip confirmation prompt}';

    protected $description = 'Delete a faculty or admin account and
        its related profile data.';

    public function handle(): int
    {
        $email = $this->argument('email');
        $role = $this->option('role');

        $query = User::where('email', $email);

        if ($role) {
            $query->where('role', $role);
        }

        $user = $query->first();

        if (!$user) {
            $this->error("No account found for {$email}.");
            return self::FAILURE;
        }

        if (!$this->option('force') && ! $this->confirm(
            "Delete {$user->email} ({$user->role}) and related data?",
            false
        )) {
            $this->warn('Aborted.');
            return self::SUCCESS;
        }

        DB::transaction(function () use ($user) {
            $user->profile()?->delete();

            if ($user->role === 'faculty' && $user->faculty) {
                $user->faculty()->delete();
            }

            if (in_array($user->role, ['admin', 'superadmin'], true)) {
                $user->permissions()->detach();
                $user->allowedPrograms()->detach();
            }

            $user->delete();
        });

        $this->info("Deleted {$email} successfully.");
        return self::SUCCESS;
    }
}