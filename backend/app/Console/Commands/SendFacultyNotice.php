<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;
use App\Mail\FlssImplementationNotice;
use App\Jobs\SendFacultyFirstLoginPasswordJob;

class SendFacultyNotice extends Command
{
    // This is the command you will type in the terminal
    protected $signature = 'flss:send-notice';

    protected $description = 'Send the FLSS implementation notice and credentials to a specific faculty member.';

    public function handle()
    {
        // 1. Gather interactive inputs
        $this->info('--- FLSS Manual Notice Generator ---');
        $firstName = $this->ask('Enter First Name');
        $lastName = $this->ask('Enter Last Name');
        $email = $this->ask('Enter Email Address');
        $password = $this->ask('Enter Temporary/Backup Password');
        
        $loginUrl = config('app.url') . '/login'; // Update with your actual login route

        // 2. Confirm details before sending
        $this->table(
            ['Field', 'Value'],
            [
                ['Name', "$firstName $lastName"],
                ['Email', $email],
                ['Password', $password],
            ]
        );

        if (!$this->confirm('Do you want to send the notice with these details?')) {
            $this->error('Operation cancelled.');
            return Command::FAILURE;
        }

        // 3. Trigger 1: The Implementation Notice (Mailable)
        Mail::to($email)->queue(new FlssImplementationNotice(
            $firstName,
            $lastName,
            $password,
            $loginUrl
        ));

        // 4. Trigger 2: The Credentials Email (Job)
        // We pass the data as a generic object/array so the Job can handle it
        dispatch(new SendFacultyFirstLoginPasswordJob(
            (object)['first_name' => $firstName, 'last_name' => $lastName, 'email' => $email],
            $password
        ))->delay(now()->addSeconds(5)); // Delay 5 seconds so they don't arrive mixed up

        $this->info('Notice and Credentials successfully dispatched to the queue!');
        
        return Command::SUCCESS;
    }
}