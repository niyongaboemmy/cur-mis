<?php

declare(strict_types=1);

namespace App\Models;

class ExamScheduleModel extends BaseModel
{
    protected string $table      = 'exam_schedules';
    protected string $primaryKey = 'id';
    protected array  $fillable   = [
        'module_id', 'option_id', 'term_id', 'academic_year', 'component',
        'exam_date', 'start_time', 'end_time', 'campus_id',
        'instructor_name', 'notes',
    ];
}
