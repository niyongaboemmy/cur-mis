<?php

declare(strict_types=1);

namespace App\Models;

class PermissionModel extends BaseModel
{
    protected string $table = 'permissions';

    protected array $fillable = [
        'category_id',
        'name',
        'slug',
        'description',
    ];
}
