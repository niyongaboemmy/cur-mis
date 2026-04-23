<?php

declare(strict_types=1);

namespace App\Models;

class IntakeModel extends BaseModel
{
    protected string $table = 'intakes';
    protected array $fillable = [
        'name',
        'start_date',
        'end_date',
        'is_active',
    ];

    public function getActive(): array
    {
        return $this->db->fetchAll("SELECT * FROM {$this->table} WHERE is_active = 1 ORDER BY start_date ASC");
    }
}
