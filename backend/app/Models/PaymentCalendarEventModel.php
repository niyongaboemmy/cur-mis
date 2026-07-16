<?php

declare(strict_types=1);

namespace App\Models;

class PaymentCalendarEventModel extends BaseModel
{
    protected string $table      = 'payment_calendar_events';
    protected string $primaryKey = 'id';

    protected array $fillable = [
        'academic_year_id', 'event_type', 'label', 'event_date',
        'fee_structure_id', 'is_active', 'created_by',
    ];

    public function listWithFilters(array $filters): array
    {
        $where    = ['1=1'];
        $bindings = [];

        if (!empty($filters['academic_year_id'])) {
            $where[]    = 'pce.`academic_year_id` = ?';
            $bindings[] = $filters['academic_year_id'];
        }
        if (!empty($filters['event_type'])) {
            $where[]    = 'pce.`event_type` = ?';
            $bindings[] = $filters['event_type'];
        }
        if (isset($filters['is_active']) && $filters['is_active'] !== null) {
            $where[]    = 'pce.`is_active` = ?';
            $bindings[] = (int)$filters['is_active'];
        }
        if (!empty($filters['from_date'])) {
            $where[]    = 'pce.`event_date` >= ?';
            $bindings[] = $filters['from_date'];
        }
        if (!empty($filters['to_date'])) {
            $where[]    = 'pce.`event_date` <= ?';
            $bindings[] = $filters['to_date'];
        }

        $whereSql = implode(' AND ', $where);

        return $this->db->fetchAll(
            "SELECT pce.*, ay.`label` AS academic_year_label, fs.`label` AS fee_structure_label
             FROM `payment_calendar_events` pce
             LEFT JOIN `academic_years` ay  ON ay.`id` = pce.`academic_year_id`
             LEFT JOIN `fee_structures` fs  ON fs.`id` = pce.`fee_structure_id`
             WHERE {$whereSql}
             ORDER BY pce.`event_date` ASC, pce.`id` ASC",
            $bindings
        );
    }
}
