<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;
use App\Models\User;

class FacultyStatusChangedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    protected $user;
    protected $oldStatus;
    protected $newStatus;

    /**
     * Create a new notification instance for status change.
     *
     * @param User $user
     * @param string $oldStatus
     * @param string $newStatus
     */
    public function __construct(User $user, string $oldStatus, string $newStatus)
    {
        $this->user = $user;
        $this->oldStatus = $oldStatus;
        $this->newStatus = $newStatus;
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
            'type'         => 'faculty_status_change',
            'faculty_id'   => $this->user->faculty->id ?? null,
            'faculty_name' => $name,
            'old_status'   => $this->oldStatus,
            'new_status'   => $this->newStatus,
            'title'        => 'Faculty Status Changed',
            'message'      => "{$name} account status changed to {$this->newStatus}.",
            'action_url'   => '/admin/faculty',
            'icon'         => 'person_off',
        ];
    }
}
