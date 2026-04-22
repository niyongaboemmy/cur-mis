<?php

declare(strict_types=1);

namespace App\Models;

class StudentModel extends BaseModel
{
    // Point to student table, though students view is available for read-only
    protected string $table = 'student';
    protected array $fillable = [
        'regnumber', 'fname', 'lname', 'phone', 'email', 'gender', 
        'birthdate', 'nationality', 'program', 'faculty', 
        'department', 'current_level', 'registration_date', 'student_state'
    ];
}
