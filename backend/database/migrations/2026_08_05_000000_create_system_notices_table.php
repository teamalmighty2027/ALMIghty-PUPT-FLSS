<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Migration to create the system_notices table for tracking operational
// events, frontend errors, backend exceptions, and security alerts.
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('system_notices', function (Blueprint $table) {
            $table->id();

            // Category of notice for filtering and routing
            $table->string('type', 64);

            // Urgency level of the notice
            $table->enum('severity', ['info', 'warning', 'error', 'critical'])
                ->default('info');

            // Whether this originated from browser or server
            $table->enum('source', ['frontend', 'backend'])
                ->default('backend');

            $table->string('title', 255);
            $table->text('message');

            // JSON payload: stack trace, request URL, user agent, etc.
            $table->json('context')->nullable();

            // The user who triggered the event (nullable for system events)
            $table->unsignedBigInteger('user_id')->nullable();

            // Resolution tracking
            $table->timestamp('resolved_at')->nullable();
            $table->unsignedBigInteger('resolved_by')->nullable();

            $table->timestamps();

            $table->foreign('user_id')
                ->references('id')->on('users')
                ->onDelete('set null');

            $table->foreign('resolved_by')
                ->references('id')->on('users')
                ->onDelete('set null');

            // Indexes for common query patterns
            $table->index(['type', 'severity']);
            $table->index('resolved_at');
            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('system_notices');
    }
};
