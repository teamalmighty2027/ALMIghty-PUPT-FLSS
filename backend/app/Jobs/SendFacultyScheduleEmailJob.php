<?php

namespace App\Jobs;

use App\Models\EmailDispatchLog;
use Carbon\Carbon;
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
    protected $dispatchedAt;

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
        $this->faculty      = $faculty;
        $this->dispatchedAt = Carbon::now();
    }

    /**
     * Execute the job.
     *
     * @return void
     */
    public function handle()
    {
        $email = $this->faculty->user->email ?? null;
        $name  = $this->faculty->user->name ?? 'Faculty Member';

        if (!$email) {
            Log::warning(
                "Skipping schedule email: missing email address for faculty ID "
                . ($this->faculty->id ?? 'unknown')
            );

            return;
        }

        $dataSchedule = [
            'faculty_name' => $name,
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

            // Record successful email dispatch
            EmailDispatchLog::create([
                'faculty_id'      => $this->faculty->id ?? null,
                'recipient_email' => $email,
                'recipient_name'  => $name,
                'purpose'         => 'schedule_published',
                'status'          => 'sent',
                'dispatched_at'   => $this->dispatchedAt,
                'processed_at'    => Carbon::now(),
            ]);

            Log::info(
                "Official load & schedule email sent to: " . $email
            );
        } catch (\Exception $e) {
            // Record failed email dispatch
            EmailDispatchLog::create([
                'faculty_id'      => $this->faculty->id ?? null,
                'recipient_email' => $email,
                'recipient_name'  => $name,
                'purpose'         => 'schedule_published',
                'status'          => 'failed',
                'error_message'   => $e->getMessage(),
                'dispatched_at'   => $this->dispatchedAt,
                'processed_at'    => Carbon::now(),
            ]);

            Log::error(
                "Failed to send schedule email to faculty " . $email .
                ": " . $e->getMessage()
            );

            $this->fail($e);
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