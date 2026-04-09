<?php

namespace App\Http\Controllers;

use App\Jobs\SyncPuptasProgramsJob;
use Illuminate\Http\JsonResponse;

class ProgramSyncController extends Controller
{
    public function syncProgramsManual(): JsonResponse
    {
        SyncPuptasProgramsJob::dispatch();

        return response()->json([
            'message' => 'Program sync queued.',
            'queued_at' => now()->toIso8601String(),
        ], 202);
    }
}
