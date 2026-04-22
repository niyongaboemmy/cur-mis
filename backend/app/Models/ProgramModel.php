<?php

declare(strict_types=1);

namespace App\Models;

class ProgramModel extends BaseModel
{
    protected string $table = 'programs';
    protected array $fillable = [
        'department_id', 'code', 'name', 'degree_type', 
        'duration_years', 'total_credits', 'is_active'
    ];
}
