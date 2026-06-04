<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AppealAccessDenied extends Mailable
{
    use Queueable, SerializesModels;

    public $firstName; // Changed from $facultyName to match your approved format

    public function __construct($firstName)
    {
        $this->firstName = $firstName;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Schedule Appeal Access Denied - PUPT FLSS',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.appeal-access-denied',
        );
    }

    public function attachments(): array
    {
        return [];
    }
}