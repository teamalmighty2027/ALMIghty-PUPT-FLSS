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
    protected $inputtedByAdmin;
    protected $adminName;

    /**
     * Create a new notification instance.
     */
    public function __construct(
        Faculty $faculty,
        bool $inputtedByAdmin = false,
        ?string $adminName = null
    ) {
        $this->faculty = $faculty;
        $this->inputtedByAdmin = $inputtedByAdmin;
        $this->adminName = $adminName;
    }

    public function via($notifiable)
    {
        // Stores in the 'notifications' table
        return ['database'];
    }

    /**
     * Get the array representation of the notification.
     */
    public function toArray($notifiable)
    {
        $facultyName = $this->faculty->user->formatted_name
            ?? "Faculty ID: {$this->faculty->id}";

        if ($this->inputtedByAdmin) {
            $adminText = $this->adminName
                ? "Admin {$this->adminName}"
                : 'an Administrator';

            return [
                'type' => 'preference_submission',
                'faculty_id' => $this->faculty->id,
                'title' => 'Preferences Inputted by Admin',
                'message' => "Schedule preferences for {$facultyName} were "
                    . "inputted by {$adminText}.",
                'action_url' => '/admin/manage-preferences',
                'icon' => 'manage_accounts',
                'is_admin_override' => true,
                'admin_name' => $this->adminName,
            ];
        }

        return [
            'type' => 'preference_submission',
            'faculty_id' => $this->faculty->id,
            'title' => 'Preferences Submitted',
            'message' => "{$facultyName} has submitted their schedule "
                . 'preferences.',
            'action_url' => '/admin/manage-preferences',
            'icon' => 'check_circle',
            'is_admin_override' => false,
        ];
    }
}