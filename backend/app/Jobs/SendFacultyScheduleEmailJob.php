<?php

namespace App\Jobs;

use Exception;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;

class SendFacultyScheduleEmailJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $faculty;

    public $tries = 3;
    public $timeout = 60;

    /**
     * Create a new job instance.
     *
     * @param  $faculty  The faculty instance passed from the controller
     * @return void
     */
    public function __construct($faculty)
    {
        $this->faculty = $faculty;
    }

    /**
     * Execute the job.
     *
     * @return void
     */
    public function handle()
    {
        $email = $this->faculty->user->email ?? null;

        if (!$email) {
            Log::warning(
                "Skipping schedule email: missing email address for faculty ID " .
                ($this->faculty->id ?? 'unknown')
            );

            return;
        }

        $dataSchedule = [
            'faculty_name' => $this->faculty->user->name ?? 'Faculty Member',
            'email'        => $email,
        ];

        try {
            Mail::send(
                'emails.load_schedule_published',
                $dataSchedule,
                function ($message) use ($email) {
                    $message->to($email)
                        ->subject(
                            'Your Official Load & Schedule is now available'
                        );
                }
            );

            Log::info(
                "Official load & schedule email sent to: " . $email
            );
        } catch (\Exception $e) {
            Log::error(
                "Failed to send schedule email to faculty " . $email .
                ": " . $e->getMessage()
            );
        }
    }

    /**
     * Handle job failure.
     *
     * @param  Exception  $exception
     * @return void
     */
    public function failed(Exception $exception)
    {
        $email = $this->faculty->user->email ?? 'Unknown Email';
        Log::error(
            'SendFacultyScheduleEmailJob failed for faculty ' . $email .
            ': ' . $exception->getMessage()
        );
    }
}