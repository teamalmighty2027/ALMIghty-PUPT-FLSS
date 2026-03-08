<?php
namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Logo;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

class LogoController extends Controller
{
    private const MAX_FILE_SIZE             = 1024; // 1MB
    private const MAX_FILENAME_LENGTH       = 100;
    private const SANITIZED_FILENAME_LENGTH = 80;
    private const ALLOWED_MIME_TYPES        = 'jpeg,png,jpg';
    private const STORAGE_DISK              = 'logos';
    private const STORAGE_PATH              = '';

    public function index(): JsonResponse
    {
        $logos = Logo::all()->map(function ($logo) {
            return $this->addUrlToLogo($logo->toArray());
        });

        return response()->json($logos);
    }

    public function upload(Request $request): JsonResponse
    {
        $validator = $this->createValidator($request);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $file = $request->file('logo');
        $type = $request->input('type');

        $this->deleteExistingLogo($type);

        $finalFileName = $this->sanitizeFileName($file);
        $path          = $file->storeAs(self::STORAGE_PATH, $type . '_' . $finalFileName, self::STORAGE_DISK);

        $logo = Logo::create([
            'type'      => $type,
            'file_name' => $finalFileName,
            'file_path' => $path,
            'mime_type' => $file->getMimeType(),
            'file_size' => $file->getSize(),
        ]);

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Logo Uploaded
        // ═══════════════════════════════════════════════════════
        AuditLogger::logUpdate(
            model: 'Logo',
            modelId: 0,
            oldData: [],
            newData: $logo->toArray(),
            description: "Uploaded new {$type} logo"
        );

        return response()->json($this->addUrlToLogo($logo->toArray()), 201);
    }

    public function getImage(string $type): JsonResponse | \Illuminate\Http\Response
    {
        $logo = Logo::where('type', $type)->first();

        if (! $logo) {
            return $this->notFoundResponse();
        }

        if (! Storage::disk(self::STORAGE_DISK)->exists($logo->file_path)) {
            return $this->notFoundResponse();
        }

        $file = Storage::disk(self::STORAGE_DISK)->get($logo->file_path);

        return response($file)
            ->header('Content-Type', $logo->mime_type)
            ->header('Cache-Control', 'public, max-age=3600');
    }

    public function show(string $type): JsonResponse
    {
        $logo = Logo::where('type', $type)->first();

        if (! $logo) {
            return $this->notFoundResponse();
        }

        return response()->json($this->addUrlToLogo($logo->toArray()));
    }

    public function delete(string $type): JsonResponse
    {
        $logo = Logo::where('type', $type)->first();

        if (! $logo) {
            return $this->notFoundResponse();
        }

        $fileDeleted = Storage::disk(self::STORAGE_DISK)->delete($logo->file_path);
        $originalData = $logo->toArray();

        $logo->delete();

        // ═══════════════════════════════════════════════════════
        // AUDIT LOG: Logo Deleted
        // ═══════════════════════════════════════════════════════
        AuditLogger::logDelete(
            model: 'Logo',
            modelId: 0,
            data: $originalData,
            description: "Deleted {$type} logo"
        );

        return response()->json([
            'message'      => 'Logo deleted successfully',
            'file_deleted' => $fileDeleted,
        ]);
    }

    private function createValidator(Request $request): \Illuminate\Validation\Validator
    {
        return Validator::make($request->all(), [
            'type' => [
                'required',
                'string',
                'in:' . implode(',', Logo::getTypes()),
            ],
            'logo' => [
                'required',
                'file',
                'mimes:' . self::ALLOWED_MIME_TYPES,
                'max:' . self::MAX_FILE_SIZE,
                function ($attribute, $value, $fail) {
                    if (strlen($value->getClientOriginalName()) > self::MAX_FILENAME_LENGTH) {
                        $fail('The filename exceeds the maximum length of ' . self::MAX_FILENAME_LENGTH . ' characters.');
                    }
                },
            ],
        ], [
            'type.required' => 'The logo type is required.',
            'type.in'       => 'Invalid logo type. Allowed types: ' . implode(', ', Logo::getTypes()),
            'logo.required' => 'Please select a logo file to upload.',
            'logo.file'     => 'The uploaded file is invalid.',
            'logo.mimes'    => 'The logo must be a JPG or PNG image.',
            'logo.max'      => 'The logo must not be larger than 1MB.',
        ]);
    }

    private function deleteExistingLogo(string $type): void
    {
        $existingLogo = Logo::where('type', $type)->first();
        if ($existingLogo) {
            Storage::disk(self::STORAGE_DISK)->delete($existingLogo->file_path);
            $existingLogo->delete();
        }
    }

    private function sanitizeFileName($file): string
    {
        $originalName   = $file->getClientOriginalName();
        $extension      = $file->getClientOriginalExtension();
        $nameWithoutExt = pathinfo($originalName, PATHINFO_FILENAME);

        $sanitizedName = substr(
            preg_replace('/[^a-zA-Z0-9-_.]/', '', $nameWithoutExt),
            0,
            self::SANITIZED_FILENAME_LENGTH
        );

        return $sanitizedName . '.' . $extension;
    }

    private function addUrlToLogo(array $logo): array
    {
        $logo['url'] = env('APP_ENV') === 'production'
        ? env('APP_URL') . '/logos/' . $logo['file_path']
        : asset('logos/' . $logo['file_path']);

        return $logo;
    }

    private function notFoundResponse(): JsonResponse
    {
        return response()->json(['message' => 'Logo not found'], 404);
    }
}