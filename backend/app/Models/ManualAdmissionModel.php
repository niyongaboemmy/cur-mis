<?php

declare(strict_types=1);

namespace App\Models;

class ManualAdmissionModel extends BaseModel
{
    protected string $table    = 'manual_admissions';
    protected array  $fillable = [
        'application_id', 'admitted_by', 'reason', 'notes', 'admitted_at', 'offer_id',
    ];
    protected array $hidden = [];
}
