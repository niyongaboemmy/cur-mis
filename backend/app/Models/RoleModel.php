<?php

declare(strict_types=1);

namespace App\Models;

class RoleModel extends BaseModel
{
    protected string $table = 'roles';

    protected array $fillable = [
        'name',
        'description',
    ];
}
