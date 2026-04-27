<?php

declare(strict_types=1);

namespace App\Models;

class LeaveRequestModel extends BaseModel
{
    protected string $table      = 'leave_requests';
    protected string $primaryKey = 'id';
    protected array  $fillable   = [
        'employee_id', 'leave_type_id',
        'start_date', 'end_date', 'days_requested',
        'reason', 'status',
        'reviewed_by', 'reviewed_at', 'review_comment',
    ];
}
