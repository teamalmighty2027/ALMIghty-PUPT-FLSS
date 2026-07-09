<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FacultyTimePlotConfig extends Model
{
    protected $table = 'faculty_time_plot_configs';

    protected $fillable = [
        'time_type',
        'weekly_hours_cap',
    ];

    /**
     * Retrieves the weekly hour cap for a specific time plot type.
     *
     * @param string $type The time plot type
     * @return int The cap in hours, defaults to 0 if not found
     */
    public static function capFor(string $type): int
    {
        $config = self::where('time_type', $type)->first();

        if ($config) {
            return (int) $config->weekly_hours_cap;
        }

        return 0;
    }
}
