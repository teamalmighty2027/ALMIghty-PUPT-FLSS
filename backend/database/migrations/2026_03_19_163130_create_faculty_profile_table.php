<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('faculty_profile', function (Blueprint $table) {
            $table->id('faculty_profile_id');            
            $table->unsignedBigInteger('faculty_id')->unique();
            $table->foreign('faculty_id')
              ->references('id')
              ->on('faculty')
              ->cascadeOnDelete();
                      
            // Address details
            $table->string('house_num')->nullable();
            $table->string('street')->nullable();
            $table->string('barangay')->nullable();
            $table->string('city')->nullable();
            $table->string('province')->nullable();
            $table->string('country')->nullable();
            $table->integer('zipcode')->nullable();

            $table->unsignedInteger('program_id')->nullable();
            $table->foreign('program_id')
              ->references('program_id')
              ->on('programs')
              ->onDelete('set null');
            $table->date('birthdate')->nullable();
            $table->enum('sex', ['Male', 'Female'])->nullable();
            
            $table->timestamps();
        });

        // Find faculty table and add profile_id column
        if (Schema::hasTable('faculty')) {
            // If column already exists, drop it first to avoid conflicts
            if (Schema::hasColumn('faculty', 'faculty_profile_id')) {
                Schema::table('faculty', function (Blueprint $table) {
                  try {
                    $table->dropForeign(['faculty_profile_id']);
                  } catch (\Exception $e) {
                    // Ignore if the foreign key constraint does not exist or has a non-standard name
                  }
                  $table->dropColumn('faculty_profile_id');    
                });
            }
            
            Schema::table('faculty', function (Blueprint $table) {
                $table->unsignedBigInteger('faculty_profile_id')->nullable()->after('id');
            });
        }

        // Create indexes
        Schema::table('faculty_profile', function (Blueprint $table) {
            $table->index('faculty_id');
            $table->index('program_id');            
        });

        Schema::table('faculty', function (Blueprint $table) {
            $table->index('faculty_profile_id');
        });

        // Create faculty profiles for each existing faculty
        if (Schema::hasTable('faculty')) {
            $faculties = DB::table('faculty')->get();
            
            foreach ($faculties as $faculty) {
                $profileId = DB::table('faculty_profile')->insertGetId([
                    'faculty_id' => $faculty->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                
                // Update faculty record with the new profile_id
                DB::table('faculty')
                    ->where('id', $faculty->id)
                    ->update(['faculty_profile_id' => $profileId]);
            }
        }

        // Now add the foreign key constraint after data is populated
        Schema::table('faculty', function (Blueprint $table) {
            $table->foreign('faculty_profile_id')
                ->references('faculty_profile_id')
                ->on('faculty_profile')
                ->restrictOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('faculty')) {
            if (Schema::hasColumn('faculty', 'faculty_profile_id')) {
                Schema::table('faculty', function (Blueprint $table) {
                    try {
                      $table->dropForeign(['faculty_profile_id']);
                    } catch (\Exception $e) {
                      // Ignore if the foreign key constraint does not exist or has a non-standard name
                    }
                    
                    $table->dropColumn('faculty_profile_id');
                });
            }
        }
        
        Schema::dropIfExists('faculty_profile');
    }
};
