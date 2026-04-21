<?php

declare(strict_types=1);

namespace App\Models;

class RoomModel extends BaseModel
{
    protected string $table = 'rooms';
    protected array $fillable = ['name', 'building', 'capacity', 'room_type', 'is_active'];
}
