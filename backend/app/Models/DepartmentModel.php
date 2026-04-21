<?php

declare(strict_types=1);

namespace App\Models;

class DepartmentModel extends BaseModel
{
    // The table name in the DB has a typo: 'departements'
    protected string $table = 'departements';
    protected array $fillable = ['name', 'code', 'description', 'faculty_id', 'is_active'];
}
