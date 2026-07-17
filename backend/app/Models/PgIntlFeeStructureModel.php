<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Postgraduate Fees — International Students (Phase 5). Deliberately its own model/table,
 * separate from FeeStructureModel, per the client's explicit instruction not to merge
 * postgraduate/international fees into the regular fee schedule.
 */
class PgIntlFeeStructureModel extends BaseModel
{
    protected string $table = 'postgraduate_international_fee_structures';
    protected array $fillable = [
        'academic_year_id', 'department_id', 'level_id', 'fee_type', 'label', 'amount', 'currency',
        'semester', 'payment_plan', 'installment_count', 'nationality_region', 'surcharge_type',
        'is_active', 'created_by',
    ];

    /** @param array{academic_year_id?:int,department_id?:int,level_id?:int,fee_type?:string,nationality_region?:string,surcharge_type?:string,is_active?:bool} $filters */
    public function listWithJoins(array $filters = []): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['academic_year_id'])) {
            $where[]    = 'pgifs.academic_year_id = ?';
            $bindings[] = (int)$filters['academic_year_id'];
        }
        if (isset($filters['department_id'])) {
            $where[]    = 'pgifs.department_id = ?';
            $bindings[] = $filters['department_id'] ? (int)$filters['department_id'] : null;
        }
        if (isset($filters['level_id'])) {
            $where[]    = 'pgifs.level_id = ?';
            $bindings[] = $filters['level_id'] ? (int)$filters['level_id'] : null;
        }
        if (!empty($filters['fee_type'])) {
            $where[]    = 'pgifs.fee_type = ?';
            $bindings[] = $filters['fee_type'];
        }
        if (!empty($filters['nationality_region'])) {
            $where[]    = 'pgifs.nationality_region = ?';
            $bindings[] = $filters['nationality_region'];
        }
        if (!empty($filters['surcharge_type'])) {
            $where[]    = 'pgifs.surcharge_type = ?';
            $bindings[] = $filters['surcharge_type'];
        }
        if (isset($filters['is_active'])) {
            $where[]    = 'pgifs.is_active = ?';
            $bindings[] = (int)$filters['is_active'];
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        return $this->db->fetchAll(
            "SELECT pgifs.*,
                    ay.label   AS academic_year_label,
                    d.dep_name AS department_name,
                    l.name     AS level_name
             FROM `postgraduate_international_fee_structures` pgifs
             LEFT JOIN `academic_years` ay ON ay.id    = pgifs.academic_year_id
             LEFT JOIN `departements`   d  ON d.dep_id = pgifs.department_id
             LEFT JOIN `levels`         l  ON l.id     = pgifs.level_id
             {$whereSql}
             ORDER BY pgifs.fee_type, pgifs.label",
            $bindings
        );
    }
}
