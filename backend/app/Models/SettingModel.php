<?php

declare(strict_types=1);

namespace App\Models;

class SettingModel extends BaseModel
{
    protected string $table = 'settings';
    protected array $fillable = ['key_name', 'value', 'description'];
}
