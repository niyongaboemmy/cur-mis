<?php

declare(strict_types=1);

namespace App\Models;

class HrEmployeeModel extends BaseModel
{
    protected string $table = 'hr_employees';
    protected array $fillable = [
        'emp_code', 'staff_id', 'full_name', 'gender',
        'department', 'position', 'contract_type',
        'start_date', 'end_date', 'salary',
        'phone', 'email', 'status',
    ];
}
