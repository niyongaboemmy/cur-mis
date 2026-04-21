<?php

declare(strict_types=1);

namespace App\Models;

class DegreeModel extends BaseModel
{
    protected string $table = 'degrees';
    protected array $fillable = ['label', 'description', 'is_active'];
}
