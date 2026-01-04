<?php

namespace App\Http\Controllers;

use App\Models\VersionControl;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Helpers\VersionControlHelper;

class VersionControlController extends Controller
{
    public function restore($id)
    {
        $log = VersionControl::find($id);

        if (!$log || empty($log->old_data)) {
            return response()->json(['message' => 'Record not found or no backup data available.'], 404);
        }

        $oldData = $log->old_data; 

        DB::beginTransaction();
        try {
            switch ($log->table_name) {
                case 'faculty':
                    $user = User::find($log->record_id);
                    if ($user) {
                        // 1. Restore User fields
                        // Only update fields that exist in the User model and were tracked
                        $userFields = ['first_name', 'middle_name', 'last_name', 'suffix_name', 'email', 'status'];
                        $userData = array_intersect_key($oldData, array_flip($userFields));
                        
                        if (!empty($userData)) {
                            $user->update($userData);
                        }

                        // 2. Restore Faculty fields (specifically faculty_type_id)
                        if (array_key_exists('faculty_type_id', $oldData)) {
                            // Ensure the faculty relationship exists
                            $user->faculty()->updateOrCreate(
                                ['user_id' => $user->id],
                                ['faculty_type_id' => $oldData['faculty_type_id']]
                            );
                        }
                    } else {
                        throw new \Exception("Target user (ID: {$log->record_id}) not found.");
                    }
                    break;

                default:
                    return response()->json(['message' => 'Table restoration not implemented yet.'], 501);
            }

            // Log the Restore action so it appears in the history
            VersionControlHelper::logChange(
                'RESTORED',
                $log->table_name,
                $log->record_id,
                $log->component,
                "Restored state from: " . $log->created_at->format('M d, Y g:i A')
            );

            DB::commit();
            return response()->json(['message' => 'Record restored successfully.']);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Restore failed: ' . $e->getMessage()], 500);
        }
    }

    public function revertAdd($id)
    {
        $log = VersionControl::find($id);

        if (!$log || $log->action_type !== 'ADDED') {
            return response()->json(['message' => 'Invalid record for deletion.'], 400);
        }

        DB::beginTransaction();
        try {
            switch ($log->table_name) {
                case 'faculty':
                    $user = User::find($log->record_id);
                    if ($user) {
                        // Delete related faculty record first
                        if ($user->faculty) {
                            $user->faculty->delete();
                        }
                        // Delete the user
                        $user->delete();
                    } else {
                        // If user is already gone, we just log the deletion to keep history consistent
                    }
                    break;

                default:
                    return response()->json(['message' => 'Table deletion not implemented yet.'], 501);
            }

            VersionControlHelper::logChange(
                'DELETED',
                $log->table_name,
                $log->record_id,
                $log->component,
                "Reverted (Deleted) the addition made on: " . $log->created_at->format('M d, Y g:i A')
            );

            DB::commit();
            return response()->json(['message' => 'Addition reverted successfully.']);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Delete failed: ' . $e->getMessage()], 500);
        }
    }
}