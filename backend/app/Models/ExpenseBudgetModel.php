<?php

declare(strict_types=1);

namespace App\Models;



class ExpenseBudgetModel extends BaseModel
{
    protected string $table      = 'expense_budgets';
    protected string $primaryKey = 'id';
    protected array  $fillable   = [
        'academic_year_id',
        'category_id',
        'department_id',
        'amount',
        'notes',
        'created_by'
    ];

    /**
     * Get all budgets for a given academic year (institution-wide by default,
     * or scoped to one department when $departmentId is given).
     */
    public function getBudgetsForYear(int $yearId, ?int $departmentId = null): array
    {
        return $this->db->fetchAll(
            "SELECT
                ec.id as category_id,
                ec.name as category_name,
                COALESCE(eb.amount, 0) as amount,
                COALESCE((SELECT SUM(amount) FROM `expenses` WHERE category_id = ec.id AND academic_year_id = ?), 0) as spent
             FROM `expense_categories` ec
             LEFT JOIN `expense_budgets` eb ON eb.category_id = ec.id AND eb.academic_year_id = ?
                AND " . ($departmentId !== null ? 'eb.department_id = ?' : 'eb.department_id IS NULL'),
            $departmentId !== null ? [$yearId, $yearId, $departmentId] : [$yearId, $yearId]
        );
    }

    /**
     * Budget execution report: planned/spent/balance/variance/overspend per
     * category, optionally scoped to one department's planned budget. Variance
     * = amount_spent - planned_budget (positive means over plan); overspend
     * when spent > planned.
     *
     * NOTE: `expenses` carries no department attribution (only `expense_budgets`
     * does), so `amount_spent` is always the total institutional spend for the
     * category/year — department scoping here narrows which department's
     * *planned* figure is compared against that total, it does not split actual
     * spend by department.
     */
    public function getExecutionReport(int $yearId, ?int $departmentId = null): array
    {
        $rows = $this->db->fetchAll(
            "SELECT
                ec.id as category_id,
                ec.name as category_name,
                d.dep_id as department_id,
                d.dep_name as department_name,
                COALESCE(eb.amount, 0) as planned_budget,
                COALESCE((SELECT SUM(amount) FROM `expenses` e
                          WHERE e.category_id = ec.id AND e.academic_year_id = ?), 0) as amount_spent
             FROM `expense_categories` ec
             LEFT JOIN `expense_budgets` eb ON eb.category_id = ec.id AND eb.academic_year_id = ?
                AND " . ($departmentId !== null ? 'eb.department_id = ?' : 'eb.department_id IS NULL') . "
             LEFT JOIN `departements` d ON d.dep_id = eb.department_id
             ORDER BY ec.name",
            $departmentId !== null
                ? [$yearId, $yearId, $departmentId]
                : [$yearId, $yearId]
        );

        return array_map(function (array $r): array {
            $planned = (float)$r['planned_budget'];
            $spent   = (float)$r['amount_spent'];
            $balance = $planned - $spent;
            return $r + [
                'planned_budget' => $planned,
                'amount_spent'   => $spent,
                'balance'        => $balance,
                'variance'       => $spent - $planned,
                'is_overspend'   => $spent > $planned,
            ];
        }, $rows);
    }

    /**
     * Upsert a budget for a category (and optional department) in a year.
     * Uses select-then-write rather than ON DUPLICATE KEY because MySQL
     * unique indexes don't treat repeated NULL department_id as a duplicate.
     */
    public function upsertBudget(int $yearId, int $categoryId, float $amount, int $createdBy, ?int $departmentId = null): void
    {
        $existing = $this->db->fetchOne(
            "SELECT id FROM `expense_budgets`
             WHERE academic_year_id = ? AND category_id = ?
             AND " . ($departmentId !== null ? 'department_id = ?' : 'department_id IS NULL'),
            $departmentId !== null ? [$yearId, $categoryId, $departmentId] : [$yearId, $categoryId]
        );

        if ($existing) {
            $this->db->execute(
                "UPDATE `expense_budgets` SET amount = ?, updated_at = NOW() WHERE id = ?",
                [$amount, $existing['id']]
            );
            return;
        }

        $this->db->execute(
            "INSERT INTO `expense_budgets` (academic_year_id, category_id, department_id, amount, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
            [$yearId, $categoryId, $departmentId, $amount, $createdBy]
        );
    }
}
