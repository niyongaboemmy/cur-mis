<?php

declare(strict_types=1);

namespace App\Models;

class PermissionCategoryModel extends BaseModel
{
    protected string $table = 'permission_categories';

    protected array $fillable = [
        'name',
        'description',
    ];
}
