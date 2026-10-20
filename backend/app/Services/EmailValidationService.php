<?php

namespace App\Services;

class EmailValidationService
{
    /**
     * Reserved non-deliverable domains that cause SMTP bounces.
     *
     * @var array<int, string>
     */
    protected static array $reservedDomains = [
        'example.com',
        'example.org',
        'example.net',
        'test.com',
        'invalid',
        'localhost',
    ];

    /**
     * Reserved top-level domains under RFC 2606 and RFC 6761.
     *
     * @var array<int, string>
     */
    protected static array $reservedTlds = [
        'example',
        'test',
        'invalid',
        'localhost',
    ];

    // Validates email syntax and checks against non-routable domains
    public static function validate(?string $email): array
    {
        if (empty($email)) {
            return [
                'valid'  => false,
                'reason' => 'Email address is missing or empty.',
                'domain' => null,
            ];
        }

        $trimmedEmail = trim($email);

        if (!filter_var($trimmedEmail, FILTER_VALIDATE_EMAIL)) {
            return [
                'valid'  => false,
                'reason' => "Invalid email format: '{$trimmedEmail}'.",
                'domain' => null,
            ];
        }

        $domain = strtolower(substr(strrchr($trimmedEmail, '@'), 1));

        foreach (self::$reservedDomains as $reserved) {
            if ($domain === $reserved
                || str_ends_with($domain, '.' . $reserved)
            ) {
                return [
                    'valid'  => false,
                    'reason' => "Non-deliverable reserved domain (@{$domain}).",
                    'domain' => $domain,
                ];
            }
        }

        $parts = explode('.', $domain);
        $tld = end($parts);

        if (in_array($tld, self::$reservedTlds, true)) {
            return [
                'valid'  => false,
                'reason' => "Reserved top-level domain (.{$tld}).",
                'domain' => $domain,
            ];
        }

        return [
            'valid'  => true,
            'reason' => null,
            'domain' => $domain,
        ];
    }
}
