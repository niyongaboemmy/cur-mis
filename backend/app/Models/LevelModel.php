<?php

declare(strict_types=1);

namespace App\Models;

class LevelModel extends BaseModel
{
    protected string $table = 'levels';
    protected array $fillable = ['name', 'is_active'];
}
