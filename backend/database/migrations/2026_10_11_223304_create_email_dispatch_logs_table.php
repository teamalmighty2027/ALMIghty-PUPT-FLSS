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
        Schema::create('email_dispatch_logs', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('faculty_id')->nullable();
            $table->string('recipient_email');
            $table->string('recipient_name')->nullable();
            $table->enum('purpose', [
                'preference_toggle',
                'schedule_published',
                'first_login_password',
                'deadline_warning',
                'reschedule_notification',
            ]);
            $table->enum('status', [
                'queued',
                'sent',
                'failed',
            ]);
            $table->text('error_message')->nullable();
            $table->timestamp('dispatched_at')->useCurrent();
            $table->timestamp('processed_at')->nullable();
            $table->unsignedBigInteger('triggered_by')->nullable();
            $table->timestamps();

            // Foreign keys
            $table->foreign('faculty_id')
                ->references('id')
                ->on('faculty')
                ->onDelete('set null');

            $table->foreign('triggered_by')
                ->references('id')
                ->on('users')
                ->onDelete('set null');

            // Indexes for fast filtering
            $table->index('faculty_id');
            $table->index('status');
            $table->index('purpose');
            $table->index('dispatched_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('email_dispatch_logs');
    }
};
