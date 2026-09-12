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
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('role_id')->nullable()->after('password');
        });

        // Backfill pre-existing user records with matching role_id
        DB::statement("
            UPDATE users u
            JOIN roles r ON r.name = u.role
            SET u.role_id = r.id
        ");

        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('role_id')->nullable(false)->change();

            $table->foreign('role_id')
                ->references('id')
                ->on('roles')
                ->onDelete('restrict');

            $table->dropUnique('users_email_role_unique');

            $table->unique(['email', 'role_id'], 'users_email_role_id_unique');

            $table->dropIndex(['role', 'status']);

            $table->index(['role_id', 'status']);

            $table->dropColumn('role');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', ['faculty', 'admin', 'superadmin'])
                ->nullable()
                ->after('password');
        });

        // Restore string role values from roles table
        DB::statement("
            UPDATE users u
            JOIN roles r ON r.id = u.role_id
            SET u.role = r.name
        ");

        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', ['faculty', 'admin', 'superadmin'])
                ->nullable(false)
                ->change();

            $table->dropForeign(['role_id']);

            $table->dropUnique('users_email_role_id_unique');

            $table->unique(['email', 'role'], 'users_email_role_unique');

            $table->dropIndex(['role_id', 'status']);

            $table->index(['role', 'status']);

            $table->dropColumn('role_id');
        });
    }
};
