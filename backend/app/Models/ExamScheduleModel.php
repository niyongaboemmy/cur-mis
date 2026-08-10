<?php

declare(strict_types=1);

namespace App\Models;

class ExamScheduleModel extends BaseModel
{
    protected string $table      = 'exam_schedules';
    protected string $primaryKey = 'id';
    // `room_id` and `invigilator_user_id` were added by migration
    // 2026_08_09_119. Without them here BaseModel::create/update silently strips
    // both, so an exam could never be given a room or a queryable invigilator.
    protected array  $fillable   = [
        'module_id', 'option_id', 'term_id', 'academic_year', 'component',
        'exam_date', 'start_time', 'end_time', 'campus_id', 'room_id',
        'instructor_name', 'invigilator_user_id', 'notes',
    ];
}
