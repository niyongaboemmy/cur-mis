<?php

declare(strict_types=1);

namespace App\Models;

class DepartmentModel extends BaseModel
{
    // The table name in the DB has a typo: 'departements' (and PK is `dep_id`).
    protected string $table      = 'departements';
    protected string $primaryKey = 'dep_id';
    protected array  $fillable   = ['name', 'code', 'description', 'faculty_id', 'is_active'];
}
