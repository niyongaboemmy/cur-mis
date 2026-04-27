<?php

declare(strict_types=1);

namespace App\Models;

class LeaveBalanceModel extends BaseModel
{
    protected string $table      = 'leave_balances';
    protected string $primaryKey = 'id';
    protected array  $fillable   = [
        'employee_id', 'leave_type_id', 'year',
        'total_days', 'used_days',
    ];
}
