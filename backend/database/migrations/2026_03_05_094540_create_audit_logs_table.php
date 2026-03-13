<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        // Check if the table already exists to avoid errors during migration
        if (!Schema::hasTable('audit_logs')) {

          Schema::create('audit_logs', function (Blueprint $table) {
              $table->id('audit_log_id');
              
              // User Information (Point-in-time snapshot)
              $table->unsignedBigInteger('user_id')->nullable()->index();
              $table->string('user_type')->nullable();
              $table->string('user_email')->nullable();
              $table->string('user_name')->nullable();
              
              // The Action
              $table->enum('action', ['login', 'logout', 'create', 'update', 'delete', 'view'])->index();
              
              // Polymorphic relation (What was affected?)
              $table->string('model')->nullable();
              $table->unsignedBigInteger('model_id')->nullable();
              
              // The Details
              $table->string('description');
              $table->json('old_values')->nullable(); 
              $table->json('new_values')->nullable(); 
              $table->json('metadata')->nullable();   
              
              // Technical Specs
              $table->string('ip_address', 45)->nullable();
              $table->string('user_agent')->nullable();
              $table->string('url')->nullable();
              $table->string('method', 10)->nullable();
              
              // Timestamps (Only created_at is needed)
              $table->timestamp('created_at')->useCurrent();

              // Composite index for incredibly fast lookups of specific records
              $table->index(['model', 'model_id']);
          });
        }
    }

    public function down()
    {
        Schema::dropIfExists('audit_logs');
    }
};