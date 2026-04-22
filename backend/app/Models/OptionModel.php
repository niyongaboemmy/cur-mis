<?php

declare(strict_types=1);

namespace App\Models;

class OptionModel extends BaseModel
{
    protected string $table = 'options';
    protected array $fillable = ['name', 'department_id', 'description', 'is_active'];
}
