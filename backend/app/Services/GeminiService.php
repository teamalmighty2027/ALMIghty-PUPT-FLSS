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

        $fileContents = file_get_contents($filePath);
        $base64Data = base64_encode($fileContents);

        $payload = [
            'contents' => [[
                'parts' => [
                    ['text' => "You are an assistant for a university scheduling system. Read this uploaded schedule appeal document. Extract and summarize the exact reason the faculty member is requesting a schedule change. Keep the summary professional, accurate, and under 2 sentences."],
                    ['inlineData' => ['mimeType' => 'application/pdf', 'data' => $base64Data]]
                ]
            ]]
        ];

        try {
            // Add timeout and base headers
            $request = Http::timeout(15)->withHeaders([
                'Content-Type' => 'application/json',
            ]);

            // ONLY disable SSL verification if running locally
            if (app()->environment('local')) {
                $request->withoutVerifying();
            }

            $response = $request->post($url, $payload);

            if ($response->successful()) {
                $data = $response->json();
                return $data['candidates'][0]['content']['parts'][0]['text'] ?? null;
            }

            // Log the real error to storage/logs/laravel.log safely
            Log::error('Gemini API Error', ['status' => $response->status(), 'body' => $response->body()]);
            return 'AI Summary currently unavailable.'; 

        } catch (\Exception $e) {
            Log::error('Gemini API Exception: ' . $e->getMessage());
            return 'AI Summary currently unavailable.';
        }
    }
}