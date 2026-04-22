<?php

declare(strict_types=1);

namespace App\Models;

class TimetableModel extends BaseModel
{
    protected string $table = 'timetable';
    protected array $fillable = [
        'course_id', 'staff_id', 'room_id', 'academic_year_id', 
        'semester', 'day_of_week', 'start_time', 'end_time'
    ];
}
