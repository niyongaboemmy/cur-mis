<?php

declare(strict_types=1);

namespace App\Models;



class ExpenseModel extends BaseModel
{
    protected string $table      = 'expenses';
    protected string $primaryKey = 'id';

    /**
     * List expenses with category name and recorder name.
     * Supports filtering by academic_year_id, category_id, and date range.
     */
    public function listWithDetails(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $where  = ['1=1'];
        $params = [];

        if (!empty($filters['academic_year_id'])) {
            $where[]  = 'e.academic_year_id = ?';
            $params[] = (int)$filters['academic_year_id'];
        }
        if (!empty($filters['category_id'])) {
            $where[]  = 'e.category_id = ?';
            $params[] = (int)$filters['category_id'];
        }
        if (!empty($filters['from_date'])) {
            $where[]  = 'e.payment_date >= ?';
            $params[] = $filters['from_date'];
        }
        if (!empty($filters['to_date'])) {
            $where[]  = 'e.payment_date <= ?';
            $params[] = $filters['to_date'];
        }

        $whereStr = implode(' AND ', $where);
        $offset   = ($page - 1) * $perPage;

        $total = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `expenses` e WHERE {$whereStr}",
            $params
        )['cnt'] ?? 0);

        $data = $this->db->fetchAll(
            "SELECT e.*,
                    ec.name                          AS category_name,
                    u.full_name                      AS recorded_by_name,
                    ay.label                         AS academic_year_label
             FROM `expenses` e
             JOIN  `expense_categories` ec ON ec.id = e.category_id
             LEFT JOIN `users` u           ON u.id  = e.recorded_by
             LEFT JOIN `academic_years` ay ON ay.id = e.academic_year_id
             WHERE {$whereStr}
             ORDER BY e.payment_date DESC, e.id DESC
             LIMIT ? OFFSET ?",
            [...$params, $perPage, $offset]
        );

        return [
            'data'         => $data,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => max(1, (int)ceil($total / $perPage)),
        ];
    }

    /**
     * Aggregate totals by category for a given academic year.
     */
    public function getSummaryByCategory(int $academicYearId): array
    {
        return $this->db->fetchAll(
            "SELECT ec.id AS category_id, ec.name AS category_name,
                    COUNT(e.id)     AS expense_count,
                    SUM(e.amount)   AS total_amount
             FROM `expense_categories` ec
             LEFT JOIN `expenses` e ON e.category_id = ec.id
                                    AND e.academic_year_id = ?
             GROUP BY ec.id, ec.name
             ORDER BY total_amount DESC",
            [$academicYearId]
        );
    }

    /**
     * Grand total expenses for an academic year.
     */
    public function getTotalForYear(int $academicYearId): float
    {
        $row = $this->db->fetchOne(
            "SELECT COALESCE(SUM(amount), 0) AS total
             FROM `expenses` WHERE academic_year_id = ?",
            [$academicYearId]
        );
        return (float)($row['total'] ?? 0);
    }
}
