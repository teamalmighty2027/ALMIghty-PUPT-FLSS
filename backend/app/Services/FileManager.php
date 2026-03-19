<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class FileManager
{
    /**
     * Saves a file to the correct folder based on the environment (dev or prod).
     */
    public function saveRescheduleFile(UploadedFile $file)
    {
        // Clean the filename so it saves nicely without weird characters
        $fileName = time() . '_' . preg_replace('/[^A-Za-z0-9.\-]/', '_', $file->getClientOriginalName());
        
        // Check if we are in local or production mode
        $environment = env('APP_ENV', 'local');

        // Choose the correct folder path
        if ($environment === 'production') {
            // Use the path we added to your .env file
            $folderPath = env('PROD_RESCHED_UPLOAD_PATH', 'production_uploads/reschedules');
        } else {
            // Default path for local development
            $folderPath = 'development_uploads/reschedules';
        }

        // Save the file into the 'public' storage disk and return the path
        return $file->storeAs($folderPath, $fileName, 'public');
    }

    /**
     * Returns the full URL to view or download the saved file.
     */
    public function viewFile($filePath)
    {
        return Storage::disk('public')->url($filePath);
    }
}