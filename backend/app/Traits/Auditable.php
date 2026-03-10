<?php

namespace App\Traits;

use App\Services\AuditLogger;

trait Auditable
{
    public static function bootAuditable()
    {
        // Automatically trigger when a new record is created
        static::created(function ($model) {
            AuditLogger::logCreate(
                class_basename($model),
                $model->id,
                $model->toArray()
            );
        });

        // Automatically trigger when a record is updated
        static::updated(function ($model) {
            AuditLogger::logUpdate(
                class_basename($model),
                $model->id,
                $model->getOriginal(), // The old data
                $model->getChanges()   // Only the fields that changed!
            );
        });

        // Automatically trigger when a record is deleted
        static::deleted(function ($model) {
            AuditLogger::logDelete(
                class_basename($model),
                $model->id,
                $model->toArray()
            );
        });
    }
}