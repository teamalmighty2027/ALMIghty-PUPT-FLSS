<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('preferences', function (Blueprint $table) {
            $table->boolean('is_auto_submitted')
                ->default(false)
                ->after('is_ignored');

            $table->index('is_auto_submitted');
        });

        // Backfill existing rows to ensure backwards compatibility
        DB::table('preferences')
            ->whereNull('is_auto_submitted')
            ->update(['is_auto_submitted' => false]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('preferences', function (Blueprint $table) {
            $table->dropIndex(['is_auto_submitted']);
            $table->dropColumn('is_auto_submitted');
        });
    }
};
