<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
      Schema::table('user_profile', function (Blueprint $table) {
          try {
              $table->dropForeign('faculty_profile_faculty_id_foreign');
          } catch (\Exception $e) {
              // Foreign key doesn't exist, continue
          }
          $table->dropColumn('faculty_id');
      });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('user_profile', function (Blueprint $table) {
            //
        });
    }
};
