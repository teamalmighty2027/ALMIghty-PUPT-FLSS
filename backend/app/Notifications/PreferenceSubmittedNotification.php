<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;
use App\Models\Faculty;

class PreferenceSubmittedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    protected $faculty;

    public function __construct(Faculty $faculty)
    {
        $this->faculty = $faculty;
    }

    public function via($notifiable)
    {
        // Stores in the 'notifications' table
        return ['database']; 
    }

    public function toArray($notifiable)
    {
        $facultyName = $this->faculty->user->formatted_name ?? "Faculty ID: {$this->faculty->id}";
        
        return [
            'type' => 'preference_submission',
            'faculty_id' => $this->faculty->id,
            'title' => 'Preferences Submitted',
            'message' => "{$facultyName} has submitted their schedule preferences.",
            'action_url' => '/admin/manage-preferences', // Route to redirect admin
            'icon' => 'check_circle'
        ];
    }
}