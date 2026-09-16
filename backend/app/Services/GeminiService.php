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
        $apiKey = config('services.gemini.api_key');
        $model = config('services.gemini.model', 'gemini-3.1-flash-lite');
        $url = "https://generativelanguage.googleapis.com/v1/models/" .
            "{$model}:generateContent?key={$apiKey}";

        $fileContents = file_get_contents($filePath);
        $base64Data = base64_encode($fileContents);

        $promptText = "You are an assistant for a university scheduling " .
            "system. Read this uploaded schedule appeal document. Extract " .
            "and summarize the exact reason the faculty member is " .
            "requesting a schedule change. Keep the summary professional, " .
            "accurate, and under 3 sentences.";

        $payload = [
            'contents' => [[
                'parts' => [
                    ['text' => $promptText],
                    [
                        'inlineData' => [
                            'mimeType' => 'application/pdf',
                            'data' => $base64Data,
                        ]
                    ]
                ]
            ]]
        ];

        try {
            // Retry twice with 1s delay and increase timeout to 45s
            $request = Http::retry(2, 1000)
                ->timeout(45)
                ->withHeaders([
                    'Content-Type' => 'application/json',
                ]);

            // ONLY disable SSL verification if running locally
            if (app()->environment('local')) {
                $request->withoutVerifying();
            }

            $response = $request->post($url, $payload);

            if ($response->successful()) {
                $data = $response->json();

                return $data['candidates'][0]['content']['parts'][0]['text']
                    ?? null;
            }

            // Log the real error to storage/logs/laravel.log safely
            Log::error('Gemini API Error', [
                'status' => $response->status(),
                'body' => $response->body()
            ]);

            return 'AI Summary currently unavailable.';

        } catch (\Exception $e) {
            Log::error('Gemini API Exception: ' . $e->getMessage());

            return 'AI Summary currently unavailable.';
        }
    }

    /**
     * Reads a PDF file, sends it to Gemini, and extracts structured schedule
     * info alongside a brief summary.
     */
    public static function extractAndSummarizeDocument($filePath): array
    {
        $apiKey = config('services.gemini.api_key');
        $model = config('services.gemini.model', 'gemini-3.1-flash-lite');
        $url = "https://generativelanguage.googleapis.com/v1/models/" .
            "{$model}:generateContent?key={$apiKey}";

        if (!file_exists($filePath)) {
            return [
                'extracted' => [
                    'day'       => null,
                    'startTime' => null,
                    'endTime'   => null,
                    'room'      => null,
                    'reason'    => null,
                ],
                'aiSummary' => null,
            ];
        }

        $fileContents = file_get_contents($filePath);
        $base64Data = base64_encode($fileContents);

        $promptText = "You are an assistant for a university schedule appeal " .
            "system. Read this uploaded document and return a valid JSON object " .
            "ONLY, without any markdown code formatting or extra text.\n" .
            "JSON structure required:\n" .
            "{\n" .
            '  "extracted": {' . "\n" .
            '    "day": "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday or null",' . "\n" .
            '    "startTime": "e.g. 08:00 AM or null",' . "\n" .
            '    "endTime": "e.g. 11:00 AM or null",' . "\n" .
            '    "room": "e.g. A401 or null",' . "\n" .
            '    "reason": "extracted reason statement or null"' . "\n" .
            "  },\n" .
            '  "aiSummary": "3-sentence executive summary of the document for admin review or null"' . "\n" .
            "}";

        $payload = [
            'contents' => [[
                'parts' => [
                    ['text' => $promptText],
                    [
                        'inlineData' => [
                            'mimeType' => 'application/pdf',
                            'data'     => $base64Data,
                        ]
                    ]
                ]
            ]]
        ];

        try {
            $request = Http::retry(2, 1000)
                ->timeout(45)
                ->withHeaders([
                    'Content-Type' => 'application/json',
                ]);

            if (app()->environment('local')) {
                $request->withoutVerifying();
            }

            $response = $request->post($url, $payload);

            if ($response->successful()) {
                $data = $response->json();
                $rawText = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
                
                // Clean potential markdown formatting
                $cleanJson = preg_replace('/^```(?:json)?\s*|\s*```$/i', '', trim($rawText));
                $parsed = json_decode($cleanJson, true);

                if (is_array($parsed)) {
                    return [
                        'extracted' => [
                            'day'       => $parsed['extracted']['day'] ?? null,
                            'startTime' => $parsed['extracted']['startTime'] ?? null,
                            'endTime'   => $parsed['extracted']['endTime'] ?? null,
                            'room'      => $parsed['extracted']['room'] ?? null,
                            'reason'    => $parsed['extracted']['reason'] ?? null,
                        ],
                        'aiSummary' => $parsed['aiSummary'] ?? null,
                    ];
                }
            }

            Log::error('Gemini PreScan Error', [
                'status' => $response->status(),
                'body'   => $response->body()
            ]);
        } catch (\Exception $e) {
            Log::error('Gemini PreScan Exception: ' . $e->getMessage());
        }

        return [
            'extracted' => [
                'day'       => null,
                'startTime' => null,
                'endTime'   => null,
                'room'      => null,
                'reason'    => null,
            ],
            'aiSummary' => null,
        ];
    }
}