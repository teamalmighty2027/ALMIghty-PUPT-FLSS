<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class RescheduleAppealController extends Controller
{
    public function uploadDocument(Request $request)
    {
        // 1. Validate the file (e.g., must be PDF/Image, max 5MB)
        $request->validate([
            'appeal_document' => 'required|file|mimes:pdf,jpg,jpeg,png|max:5048',
        ]);

        if ($request->hasFile('appeal_document')) {
            $file = $request->file('appeal_document');
            
            // 2. Generate a unique name so files don't overwrite each other
            $filename = time() . '_' . $file->getClientOriginalName();

            // 3. Save to storage/app/public/reschedules
            $path = $file->storeAs('reschedules', $filename, 'public');

            // 4. Generate the clickable public URL
            $publicUrl = asset('storage/' . $path);

            return response()->json([
                'message' => 'Document uploaded successfully!',
                'file_path' => $path, // e.g., reschedules/1711900000_doc.pdf
                'file_url' => $publicUrl // e.g., https://api-flss.../storage/reschedules/...
            ], 200);
        }

        return response()->json(['message' => 'No file was uploaded.'], 400);
    }
}