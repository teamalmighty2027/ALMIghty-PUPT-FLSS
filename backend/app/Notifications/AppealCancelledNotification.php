<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;
use App\Models\Faculty;

class AppealCancelledNotification extends Notification implements ShouldQueue
{
    use Queueable;

    protected $faculty;

    /**
     * Create a notification instance for cancelled rescheduling appeal.
     *
     * @param Faculty $faculty
     */
    public function __construct(Faculty $faculty)
    {
        $this->faculty = $faculty;
    }

    /**
     * Get the notification delivery channels.
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
            'type'         => 'appeal_cancelled',
            'faculty_id'   => $this->faculty->id,
            'faculty_name' => $name,
            'title'        => 'Schedule Appeal Cancelled',
            'message'      => "Faculty {$name} cancelled " .
              "their submitted appeal.",
            'action_url'   => '/admin/rescheduling',
            'icon'         => 'delete_outline',
        ];
    }
}
