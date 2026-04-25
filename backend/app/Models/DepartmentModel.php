<?php

declare(strict_types=1);

namespace App\Models;

class DepartmentModel extends BaseModel
{
    protected string $table      = 'departements';
    protected string $primaryKey = 'dep_id';
    protected array  $fillable   = [
        'dep_name', 'dep_acronym', 'dep_description',
        'fac_id', 'school_id', 'dep_author', 'index_number',
        'allowed_combinations', 'program_level',
    ];
    protected array $hidden = [];
}
