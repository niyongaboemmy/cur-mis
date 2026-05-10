<?php

declare(strict_types=1);

namespace App\Models;

class ModuleOfferingModel extends BaseModel
{
    protected string $table      = 'module_offerings';
    protected string $primaryKey = 'id';
    protected array  $fillable   = [
        'module_id', 'option_id', 'academic_year', 'level_id',
        'mode', 'mode_order', 'semesters', 'module_order', 'campus_id',
        'start_date', 'end_date',
        'day_of_week', 'day_pattern', 'start_time', 'end_time', 'instructor_id',
        'activity', 'instructor_name', 'year_of_study',
    ];
}
