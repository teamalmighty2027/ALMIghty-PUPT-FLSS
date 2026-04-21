<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Mail\Mailables\Attachment;

class FlssImplementationNotice extends Mailable
{
    use Queueable, SerializesModels;

    public $first_name;
    public $last_name;
    public $password;
    public $loginUrl;
    public $date_sent;

    /**
     * Create a new message instance.
     */
    public function __construct($first_name = 'Faculty', $last_name = 'Member', $password = '********', $loginUrl = '#')
    {
        $this->first_name = $first_name;
        $this->last_name = $last_name;
        $this->password = $password;
        $this->loginUrl = $loginUrl;
        $this->date_sent = now()->format('F d, Y');
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Implementation of the FLSS and Account Creation',
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            view: 'emails.flss-notice',
            with: [
                'first_name' => $this->first_name,
                'last_name' => $this->last_name,
                'password' => $this->password,
                'loginUrl' => $this->loginUrl,
                'date_sent' => $this->date_sent,
            ],
        );
    }

    /**
     * Get the attachments for the message.
     *
     * @return array<int, \Illuminate\Mail\Mailables\Attachment>
     */
    public function attachments(): array
    {
        return [
            Attachment::fromPath(public_path('PrivacyLetter.pdf'))
                ->as('PrivacyLetter.pdf')
                ->withMime('application/pdf'),
        ];
    }
}
