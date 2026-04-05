<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class FileService
{
    /**
     * Sanitize a user-provided filename to prevent path traversal and disallowed characters.
     *
     * This removes any directory components and extension from the provided value and
     * restricts the resulting base name to a safe character set. If the sanitized
     * base name is empty, a UUID will be used instead.
     */
    private function sanitizeFilename(string $filename): string
    {
        // Remove any directory components and existing extension
        $baseName = pathinfo($filename, PATHINFO_FILENAME);

        // Replace any character that is not alphanumeric, underscore, or dash
        $baseName = preg_replace('/[^A-Za-z0-9_\-]/', '_', $baseName);

        // Fallback to a UUID if nothing remains after sanitization
        if ($baseName === '' || $baseName === null) {
            $baseName = (string) Str::uuid();
        }

        return $baseName;
    }

    public function store(UploadedFile $file, string $directory, ?string $filename = null, string $disk = 'public'): string
    {
        $safeDirectory = trim($directory, '/');
        $extension = $file->getClientOriginalExtension();
        $name = $filename !== null
            ? $this->sanitizeFilename($filename)
            : (string) Str::uuid();

        if ($extension !== '') {
            $name .= '.' . $extension;
        }

        return $file->storeAs($safeDirectory, $name, $disk);
    }

    public function deleteIfExists(?string $path, string $disk = 'public'): void
    {
        if (!$path) {
            return;
        }

        if (Storage::disk($disk)->exists($path)) {
            Storage::disk($disk)->delete($path);
        }
    }
}
