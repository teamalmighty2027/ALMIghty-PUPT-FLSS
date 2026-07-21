<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;
use App\Models\User;

class FacultyReactivationRequestNotification extends Notification implements ShouldQueue
{
    use Queueable;

    protected $user;

    /**
     * Create a new notification instance for reactivation request.
     *
     * @param User $user
     */
    public function __construct(User $user)
    {
        $this->user = $user;
    }

    /**
     * Get notification delivery channels.
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
        $name = $this->user->name ?? "User #{$this->user->id}";

        return [
            'type'         => 'reactivation_request',
            'faculty_id'   => $this->user->faculty->id ?? null,
            'faculty_name' => $name,
            'title'        => 'Reactivation Request',
            'message'      => "Faculty {$name} is requesting account reactivation.",
            'action_url'   => '/admin/faculty',
            'icon'         => 'manage_accounts',
        ];
    }
}
