<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('schedules', function (Blueprint $table) {
            // 1. Add the new foreign key column
            $table->unsignedBigInteger('assignment_type_id')->nullable()->after('end_time');
            
            // 2. Set up the foreign key constraint
            $table->foreign('assignment_type_id')
                ->references('id')
                ->on('assignment_types')
                ->onDelete('set null'); // <--- This fulfills your deletion requirement!

            // 3. Drop the old string column (if it exists)
            if (Schema::hasColumn('schedules', 'assignment_type')) {
                $table->dropColumn('assignment_type');
            }
        });
    }

    public function down()
    {
        Schema::table('schedules', function (Blueprint $table) {
            $table->dropForeign(['assignment_type_id']);
            $table->dropColumn('assignment_type_id');
            $table->string('assignment_type')->nullable();
        });
    }
};
