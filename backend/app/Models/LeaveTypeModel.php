<?php

declare(strict_types=1);

namespace App\Models;

class LeaveTypeModel extends BaseModel
{
    protected string $table      = 'leave_types';
    protected string $primaryKey = 'id';
    protected array  $fillable   = [
        'name', 'description', 'days_allowed',
        'is_paid', 'color', 'is_active',
    ];
}
