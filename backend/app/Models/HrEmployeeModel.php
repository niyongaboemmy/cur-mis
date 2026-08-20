<?php

declare(strict_types=1);

namespace App\Models;

class HrEmployeeModel extends BaseModel
{
    protected string $table = 'employees';
    protected string $primaryKey = 'employee_id';
    /**
     * Columns create()/update() are allowed to write.
     *
     * filterFillable() drops anything absent here SILENTLY — no error, no
     * warning — so a column missing from this list looks to the user like the
     * value was saved and then erased. `employee_username` (which holds the
     * staff email) was missing, which is exactly how staff emails vanished on
     * both create and edit.
     *
     * Credential and session columns are deliberately NOT fillable:
     * employee_password, otp_code, otp_expires_at, last_login, login_count.
     * Those must never be settable from a request body.
     */
    protected array $fillable = [
        'employee_fname', 'employee_lname', 'employee_gender',
        'employee_position', 'employee_post', 'employee_phone',
        'employee_status', 'account_status', 'employee_reg_date',
        'employee_bank', 'employee_account', 'faculty', 'salary',
        // Previously missing — silently discarded on every write.
        'employee_username',   // the staff email address
        'employee_idcard',
        'employee_address',
        'employee_age',
        'additional_duty',
        'employee_photo',
        'school_id',
        'user_id',
        'sort_order',
    ];
}
