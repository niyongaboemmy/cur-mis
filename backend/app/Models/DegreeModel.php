<?php

declare(strict_types=1);

namespace App\Models;

class DegreeModel extends BaseModel
{
    protected string $table = 'degree_catalogue';
    protected array $fillable = [
        'code', 'name', 'department_id', 'degree_type',
        'duration_years', 'total_credits', 'is_active'
    ];
}
