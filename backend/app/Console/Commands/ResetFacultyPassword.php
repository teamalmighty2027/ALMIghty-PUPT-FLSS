<?php

namespace App\Console\Commands;

use App\Jobs\SendFacultyFirstLoginPasswordJob;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class ResetFacultyPassword extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'user:reset-password
        {email? : The email of the faculty user to reset}
        {--all : Reset passwords for ALL faculty users}
        {--default : Use a default password instead of a random one}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description =
        'Reset a faculty user\'s password with a temporary ' .
        'alphanumeric password and dispatch the email job.';

    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle(): int
    {
        $email = $this->argument('email');
        $all = $this->option('all');
        $default = $this->option('default');

        if (!$email && !$all) {
            $this->error(
                'Provide an email or use --all to reset all users.'
            );
            return 1;
        }

        if ($email && $all) {
            $this->error('Cannot use both an email and --all.');
            return 1;
        }

        if ($default && !$this->confirm(
            'Using a default password is less secure. Are you sure?',
            false
        )) {
            $this->warn('Aborted.');
            return 1;
        }

        $users = $all
            ? $this->getAllFacultyUsers()
            : $this->getSingleUser($email);

        if ($users === null || $users->isEmpty()) {
            return 1;
        }

        foreach ($users as $user) {
            $this->resetPassword($user);
        }

        $this->info('Password reset process completed.');
        return 0;
    }

    /**
     * Fetch all users with the faculty role.
     *
     * @return \Illuminate\Database\Eloquent\Collection|null
     */
    private function getAllFacultyUsers()
    {
        if (!$this->confirm(
            'Reset passwords for ALL faculty users? This cannot be undone.',
            false
        )) {
            $this->warn('Aborted.');
            return null;
        }

        return User::whereHas('roleModel', function ($q) {
            $q->where('name', 'faculty');
        })->get();
    }

    /**
     * Fetch a single user by email address.
     *
     * @param string $email
     * @return \Illuminate\Database\Eloquent\Collection
     */
    private function getSingleUser(string $email)
    {
        $users = User::where('email', $email)->get();

        if ($users->isEmpty()) {
            $this->error("No user found with email: {$email}");
        }

        return $users;
    }

    /**
     * Reset a single user's password and dispatch the email job.
     *
     * @param \App\Models\User $user
     * @return void
     */
    private function resetPassword(User $user): void
    {
        $password = $this->option('default') ? 'puptfaculty123*' : $this->generatePassword();

        // Assign plaintext — model mutator in User.php handles hashing
        $user->password = $password;
        $user->save();

        // Print before dispatching job as a console failsafe
        $this->line(
            "  <fg=yellow>[{$user->email}]</> Temp password: " .
            "<fg=cyan>{$password}</>"
        );

        try {
            // Skip dispatching email job if using default password
            if ($this->option('default')) {
                return; 
            }

            SendFacultyFirstLoginPasswordJob::dispatch($user, $password);
            $this->info("  ✓ Email job dispatched for {$user->email}");

        } catch (\Exception $e) {
            $this->warn("  ✗ Job dispatch failed: " . $e->getMessage());
            Log::error('ResetFacultyPassword: job dispatch failed', [
                'email' => $user->email,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Generate a secure alphanumeric password of the given length.
     *
     * @param int $length
     * @return string
     */
    private function generatePassword(int $length = 12): string
    {
        $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' .
               '0123456789';
        $password = '';

        for ($i = 0; $i < $length; $i++) {
            $password .= $chars[random_int(0, strlen($chars) - 1)];
        }

        return $password;
    }
}
