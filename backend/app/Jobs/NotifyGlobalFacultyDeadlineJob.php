<?php

namespace App\Jobs;

use App\Models\Faculty;
use App\Models\EmailDispatchLog;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

class NotifyGlobalFacultyDeadlineJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $faculty;
    protected $dispatchedAt;

    public function __construct(Faculty $faculty)
    {
        $this->faculty      = $faculty;
        $this->dispatchedAt = Carbon::now();
    }

    public function handle()
    {
        $facultyUser = $this->faculty->user;

        if (!$facultyUser || !$facultyUser->email) {
            Log::error(
                "Faculty email is missing for faculty ID: " .
                "{$this->faculty->id}"
            );

            return;
        }

        $facultyName = "{$facultyUser->last_name}, {$facultyUser->first_name}";

        $deadline = Carbon::parse(
            $this->faculty->preferenceSetting->global_deadline
        )->format('F d, Y');

        $data = [
            'faculty_name' => $facultyName,
            'deadline'     => $deadline,
        ];

        try {
            Mail::send(
                'emails.global_deadline_warning',
                $data,
                function ($message) use ($facultyUser) {
                    $message->to($facultyUser->email)
                        ->subject(
                            '24-Hour Notification: Global Deadline Approaching'
                        );
                }
            );

            // Record successful email dispatch
            EmailDispatchLog::create([
                'faculty_id'      => $this->faculty->id,
                'recipient_email' => $facultyUser->email,
                'recipient_name'  => $facultyName,
                'purpose'         => 'deadline_warning',
                'status'          => 'sent',
                'dispatched_at'   => $this->dispatchedAt,
                'processed_at'    => Carbon::now(),
            ]);

            Log::info(
                "Global deadline email sent to faculty ID: " .
                "{$this->faculty->id}, Email: {$facultyUser->email}"
            );
        } catch (\Exception $e) {
            // Record failed email dispatch
            EmailDispatchLog::create([
                'faculty_id'      => $this->faculty->id,
                'recipient_email' => $facultyUser->email,
                'recipient_name'  => $facultyName,
                'purpose'         => 'deadline_warning',
                'status'          => 'failed',
                'error_message'   => $e->getMessage(),
                'dispatched_at'   => $this->dispatchedAt,
                'processed_at'    => Carbon::now(),
            ]);

            Log::error(
                "Failed to send global deadline email to faculty ID: " .
                "{$this->faculty->id}. Error: {$e->getMessage()}"
            );

            $this->fail($e);
        }
    }
}
