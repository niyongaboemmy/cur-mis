<?php

declare(strict_types=1);

namespace App\Models;

class HrEmployeeModel extends BaseModel
{
    protected string $table = 'employees';
    protected string $primaryKey = 'employee_id';
    protected array $fillable = [
        'employee_fname', 'employee_lname', 'employee_gender',
        'employee_position', 'employee_post', 'employee_phone',
        'employee_status', 'account_status', 'employee_reg_date',
        'employee_bank', 'employee_account', 'faculty',
    ];
}
