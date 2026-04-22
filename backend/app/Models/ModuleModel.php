<?php

declare(strict_types=1);

namespace App\Models;

class ModuleModel extends BaseModel
{
    protected string $table = 'modules';
    protected string $primaryKey = 'module_id';
    protected array $fillable = [
        'module_name', 'module_code', 'module_credits', 
        'department', 'd_option', 'level', 'hours', 'price', 'school_id', 'is_active'
    ];
}
