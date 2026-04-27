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
        return $this->db->fetchAll(
            "SELECT MIN(id) AS id, name, MIN(start_date) AS start_date, MIN(end_date) AS end_date, is_active
             FROM {$this->table}
             WHERE is_active = 1
             GROUP BY name
             ORDER BY MIN(start_date) ASC"
        );
    }
}
