<?php

namespace App\Jobs;

use Exception;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;

class SendFacultyScheduleEmailJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $faculty;

    public $tries = 10;
    public $timeout = 300;

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
        // Format the deadline for display in the email
        $formatted_deadline = $deadline ? $deadline->setTimezone('Asia/Manila')->format('M d, Y') : 'No deadline set';

        $dataSchedule = [
            'faculty_name' => $this->faculty->user->name,
            'email' => $this->faculty->user->email,
        ];

        // Fetch the latest past preferences for this faculty to embed in the email
        $latestPastSemesterId = \App\Models\Preference::where('faculty_id', $this->facultyId)
            ->orderBy('active_semester_id', 'desc')
            ->value('active_semester_id');

        $previousPreferences = [];
        if ($latestPastSemesterId) {
            $previousPreferences = \App\Models\Preference::with([
                'courseAssignment.course',
                'temporaryCourseOffering.course'
            ])
            ->where('faculty_id', $this->facultyId)
            ->where('active_semester_id', $latestPastSemesterId)
            ->get();
        }

        // Prepare data to be passed to the email template with null checks
        $dataPreference = [
            'faculty_name' => $faculty->user->name ?? 'Faculty Member',
            'email' => $faculty->user->email,
            'faculty_units' => $faculty->faculty_units ?? 0,
            'deadline' => $formatted_deadline,
            'days_left' => $days_left,
            'previousPreferences' => $previousPreferences // <-- Pass to Blade
        ];

        Mail::send('emails.load_schedule_published', $dataSchedule, function ($message) use ($dataSchedule) {
            $message->to($dataSchedule['email'])
                ->subject('Your Official Load & Schedule is now available');
        });
    }

    /**
     * Handle job failure.
     *
     * @return void
     */
    public function failed(Exception $exception)
    {
        \Log::error('Failed to send schedule email to faculty: ' . $this->faculty->faculty_email . ' Error: ' . $exception->getMessage());
    }
}
