<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GeminiService
{
    /**
     * Reads a PDF file, sends it to Gemini, and returns a summary.
     */
    public static function summarizeAppealDocument($filePath)
    {
        $apiKey = env('GEMINI_API_KEY');
        $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={$apiKey}";

        // 1. Read the file and convert to Base64
        $fileContents = file_get_contents($filePath);
        $base64Data = base64_encode($fileContents);

        // 2. Build the exact payload Gemini expects for documents
        $payload = [
            'contents' => [
                [
                    'parts' => [
                        [
                            'text' => "You are an assistant for a university scheduling system. Read this uploaded schedule appeal document. Extract and summarize the exact reason the faculty member is requesting a schedule change. Keep the summary professional, accurate, and under 2 sentences."
                        ],
                        [
                            'inline_data' => [
                                'mime_type' => 'application/pdf',
                                'data' => $base64Data
                            ]
                        ]
                    ]
                ]
            ]
        ];

        // 3. Send the request
        try {
            // Added ->withoutVerifying() for local development testing
            $response = Http::withoutVerifying()->withHeaders([
                'Content-Type' => 'application/json',
            ])->post($url, $payload);

            if ($response->successful()) {
                $data = $response->json();
                return $data['candidates'][0]['content']['parts'][0]['text'] ?? 'Format error in Gemini response.';
            }

            // Temporarily return the actual Google API error so we can read it in the database
            return 'API ERROR: ' . $response->body();

        } catch (\Exception $e) {
            // Temporarily return the actual Laravel exception
            return 'LARAVEL ERROR: ' . $e->getMessage();
        }
    }
}