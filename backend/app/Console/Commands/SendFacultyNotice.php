<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;
use App\Mail\FlssImplementationNotice;
use App\Models\User;
use Illuminate\Support\Facades\Log;

class SendFacultyNotice extends Command
{
    // This is the command you will type in the terminal
    protected $signature = 'flss:send-notice';

    protected $description = 'Send the FLSS implementation notice and credentials to a specific faculty member.';

    public function handle()
    {
        // 1. Gather interactive inputs
        $this->info('--- FLSS Manual Notice Generator ---');
        $email    = $this->ask('Enter Faculty Email Address');
        $password = $this->ask('Enter Temporary/Backup Password');

        // 2. Look up the faculty member by email
        $user = User::where('email', $email)->first();

        if (!$user) {
            $this->error(
                "No user found with email: {$email}"
            );
            return Command::FAILURE;
        }

        $firstName = $user->first_name;
        $lastName  = $user->last_name;
        $loginUrl  = config('app.url') . '/login';

        // 3. Confirm details before sending
        $this->table(
            ['Field', 'Value'],
            [
                ['Name',     "{$firstName} {$lastName}"],
                ['Email',    $email],
                ['Password', $password],
            ]
        );

        if (!$this->confirm('Do you want to send the notice with these details?')) {
            $this->error('Operation cancelled.');
            return Command::FAILURE;
        }

        // Set the temporary password on the user record (auto-hashed via mutator)
        $user->update(['password' => $password]);

        // Dispatch a single queued email containing notice + credentials
        Mail::to($email)->queue(new FlssImplementationNotice(
            $firstName,
            $lastName,
            $email,
            $password,
            $loginUrl
        ));

        $this->info(
            'Notice and credentials dispatched as one email!'
        );

        Log::info(
            "FLSS notice sent to {$email} with temporary password."
        );

        return Command::SUCCESS;
    }
}