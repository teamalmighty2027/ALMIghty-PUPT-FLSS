<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;
use App\Models\Faculty;

class FacultyPreferenceRequestNotification extends Notification 
implements ShouldQueue
{
    use Queueable;

    protected $faculty;

    /**
     * Create a notification instance for preference access request.
     *
     * @param Faculty $faculty
     */
    public function __construct(Faculty $faculty)
    {
        $this->faculty = $faculty;
    }

    /**
     * Get the notification's delivery channels.
     *
     * @param mixed $notifiable
     * @return array
     */
    public function via($notifiable): array
    {
        return ['database'];
    }

    /**
     * Get the array representation of the notification.
     *
     * @param mixed $notifiable
     * @return array
     */
    public function toArray($notifiable): array
    {
        $name = $this->faculty->user->formatted_name
            ?? ($this->faculty->user->name
            ?? "Faculty #{$this->faculty->id}");

        return [
            'type'         => 'preference_request',
            'faculty_id'   => $this->faculty->id,
            'faculty_name' => $name,
            'title'        => 'Preference Submission Request',
            'message'      => "Faculty {$name} requested access" .
              " to submit preferences.",
            'action_url'   => '/admin/manage-preferences',
            'icon'         => 'tune',
        ];
    }
}
