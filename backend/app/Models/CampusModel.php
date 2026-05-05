<?php

declare(strict_types=1);

namespace App\Models;

class CampusModel extends BaseModel
{
    protected string $table = 'campuses';
    protected array $fillable = [
        'name', 'code', 'location', 'address', 'phone', 'email', 'is_active',
    ];
}
