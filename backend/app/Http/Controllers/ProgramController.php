<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Program;
use App\Models\Curriculum;
use App\Models\ProgramYearLevelCurricula;
use App\Services\AuditLogger;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ProgramController extends Controller
{
    public function getPrograms()
    {
        $programs = Program::with(['curricula', 'yearLevels'])->get();
    
        $formattedPrograms = $programs->map(function ($program) {
            // Sort curricula by curriculum_year in ascending order
            $sortedCurricula = $program->curricula->sortBy('curriculum_year');
    
            // Sort year levels by year in ascending order
            $sortedYearLevels = $program->yearLevels->sortBy('year');
    
            // Get the curriculum years as an array
            $curriculumYears = $sortedCurricula->pluck('curriculum_year')->toArray();
    
            // Format the program data including curricula_version
            return [
                'program_id' => $program->program_id,
                'program_code' => $program->program_code,
                'program_title' => $program->program_title,
                'program_info' => $program->program_info,
                'number_of_years' => $program->number_of_years,
                'curricula_version' => implode(', ', $curriculumYears), // Comma-separated list of curriculum years
                'status' => $program->status,
                'created_at' => $program->created_at,
                'updated_at' => $program->updated_at,
                'curricula' => $sortedCurricula->values()->all(), // Return the sorted curricula
                'year_levels' => $sortedYearLevels->values()->all() // Return the sorted year levels
            ];
        });
    
        return response()->json($formattedPrograms);
    }
    

    public function addProgram(Request $request)
    {
        // Validate the request data
        $validatedData = $request->validate([
            'program_code' => 'required|string|max:10',
            'program_title' => 'required|string|max:100',
            'program_info' => 'required|string|max:255',
            'status' => 'required|in:Active,Inactive',
            'number_of_years' => 'required|integer|min:1',
        ]);

        if ($this->puptasProgramExists($validatedData['program_code'])) {
            return response()->json([
                'message' => 'This program is synced from PUPTAS. Use the manual sync to ensure it is current.'
            ], 422);
        }
    
        // Check for uniqueness
        $existingProgram = Program::where('program_code', $validatedData['program_code'])
            ->where('program_title', $validatedData['program_title'])
            ->where('program_info', $validatedData['program_info'])
            ->first();
    
        if ($existingProgram) {
            return response()->json([
                'message' => 'A program with the same code, title, and info already exists.'
            ], 422);
        }
    
        // Create the new program
        $program = Program::create($validatedData);

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Program Created
        // ═══════════════════════════════════════════════════════
        AuditLogger::logCreate(
            model: 'Program',
            modelId: $program->program_id,
            data: $program->toArray(),
            description: "Created program: {$program->program_code} - {$program->program_title}"
        );
    
        // Refetch the program with relationships
        $program = Program::with(['curricula', 'yearLevels'])->find($program->program_id);
    
        return response()->json($program, 201);
    }


    public function getProgramDetails($id)
    {
        $program = Program::with('curricula', 'yearLevels')->findOrFail($id);
        return response()->json($program);
    }


    public function updateProgram(Request $request, $id)
    {
        $program = Program::findOrFail($id);

        // ═══════════════════════════════════════════════════════
        // SAVE OLD DATA FOR DETAILED CHANGE TRACKING
        // ═══════════════════════════════════════════════════════
        $oldData = [
            'program_code'    => $program->program_code,
            'program_title'   => $program->program_title,
            'program_info'    => $program->program_info,
            'status'          => $program->status,
            'number_of_years' => $program->number_of_years,
        ];
    
        $validatedData = $request->validate([
            'program_code' => 'required|string|max:10|unique:programs,program_code,' . $program->program_id . ',program_id',
            'program_title' => 'required|string|max:100',
            'program_info' => 'required|string|max:255',
            'status' => 'required|in:Active,Inactive',
            'number_of_years' => 'required|integer|min:1',
        ]);

        // Manually assign to check dirtiness
        if (isset($validatedData['program_code'])) $program->program_code = $validatedData['program_code'];
        if (isset($validatedData['program_title'])) $program->program_title = $validatedData['program_title'];
        if (isset($validatedData['program_info'])) $program->program_info = $validatedData['program_info'];
        if (isset($validatedData['status'])) $program->status = $validatedData['status'];
        if (isset($validatedData['number_of_years'])) $program->number_of_years = $validatedData['number_of_years'];

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: DETAILED CHANGE TRACKING
        // ═══════════════════════════════════════════════════════
        $changes = [];

        if ($oldData['program_code'] != $program->program_code) {
            $changes[] = "Code: {$oldData['program_code']} → {$program->program_code}";
        }
        if ($oldData['program_title'] != $program->program_title) {
            $changes[] = "Title: {$oldData['program_title']} → {$program->program_title}";
        }
        if ($oldData['program_info'] != $program->program_info) {
            $changes[] = "Info: {$oldData['program_info']} → {$program->program_info}";
        }
        if ($oldData['status'] != $program->status) {
            $changes[] = "Status: {$oldData['status']} → {$program->status}";
        }
        if ($oldData['number_of_years'] != $program->number_of_years) {
            $changes[] = "Years: {$oldData['number_of_years']} → {$program->number_of_years}";
        }

        if (empty($changes)) {
            return response()->json(['message' => 'No changes detected'], 422);
        }

        $program->save();
    
        $changesSummary = implode(', ', $changes);
        AuditLogger::logUpdate(
            model: 'Program',
            modelId: $program->program_id,
            oldData: $oldData,
            newData: $program->toArray(),
            description: "Updated program: {$program->program_code} - {$changesSummary}"
        );

        $program = Program::with(['curricula', 'yearLevels'])->find($program->program_id);
    
        return response()->json($program, 200);
    } 


    public function deleteProgram($id)
    {
        // Check if the program is associated with any academic year
        $isUsedInAcademicYear = ProgramYearLevelCurricula::where('program_id', $id)->exists();
    
        if ($isUsedInAcademicYear) {
            return response()->json([
                'message' => 'Cannot delete the program associated with an academic year.',
                'success' => false
            ], 200);
        }
    
        // Proceed to delete the program
        $program = Program::findOrFail($id);

        // ═══════════════════════════════════════════════════════
        // SAVE DATA FOR AUDIT BEFORE DELETION
        // ═══════════════════════════════════════════════════════
        $originalData = $program->toArray();
        $programCode = $program->program_code;
        $programTitle = $program->program_title;

        $program->delete();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Program Deleted
        // ═══════════════════════════════════════════════════════
        AuditLogger::logDelete(
            model: 'Program',
            modelId: $id,
            data: $originalData,
            description: "Deleted program: {$programCode} - {$programTitle}"
        );
    
        return response()->json([
            'message' => 'Program deleted successfully.',
            'success' => true
        ], 200);
    }    


    public function getProgramsByCurriculumYear($curriculumYear)
    {
        // Fetch the curriculum by year
        $curriculum = Curriculum::where('curriculum_year', $curriculumYear)->firstOrFail();

        // Fetch programs associated with this curriculum
        $programs = $curriculum->programs;

        return response()->json($programs);
    }

    private function puptasProgramExists(string $programCode): bool
    {
        $baseUrl = config('services.puptas.base_url');
        $apiKey = config('services.puptas.api_key');

        if (! $baseUrl || ! $apiKey) {
            Log::warning('PUPTAS check skipped: missing configuration.');
            return false;
        }

        $url = rtrim($baseUrl, '/') . '/api/v1/programs';

        try {
            $response = Http::withToken($apiKey)
                ->acceptJson()
                ->timeout(15)
                ->get($url);

            if (! $response->successful()) {
                Log::warning('PUPTAS check failed.', [
                    'status' => $response->status(),
                    'body' => $response->json(),
                ]);
                return false;
            }

            $payload = $response->json();
            $programs = $this->extractPuptasPrograms($payload);

            foreach ($programs as $program) {
                $code = trim((string) ($program['program_code'] ?? $program['code'] ?? ''));
                if ($code !== '' && strcasecmp($code, $programCode) === 0) {
                    return true;
                }
            }
        } catch (\Throwable $error) {
            Log::warning('PUPTAS check error.', [
                'message' => $error->getMessage(),
            ]);
        }

        return false;
    }

    private function extractPuptasPrograms($payload): array
    {
        if (is_array($payload) && array_is_list($payload)) {
            return $payload;
        }

        if (is_array($payload)) {
            foreach (['programs', 'data', 'items'] as $key) {
                if (isset($payload[$key]) && is_array($payload[$key])) {
                    return $payload[$key];
                }
            }
        }

        return [];
    }

}