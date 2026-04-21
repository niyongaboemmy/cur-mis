<?php

declare(strict_types=1);

namespace App\Models;

class HrEmployeeModel extends BaseModel
{
    protected string $table = 'hr_employees';
    protected array $fillable = [
        'first_name', 'last_name', 'email', 'phone', 'gender', 
        'position', 'department_id', 'joining_date', 'employment_status', 'is_active'
    ];
}
