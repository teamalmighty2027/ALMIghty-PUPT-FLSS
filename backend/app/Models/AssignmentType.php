<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AssignmentType extends Model
{
    protected $fillable = ['name'];

    public function schedules()
    {
        return $this->hasMany(Schedule::class);
    }
}