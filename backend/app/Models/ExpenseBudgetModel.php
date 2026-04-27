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
        'amount',
        'notes',
        'created_by'
    ];

    /**
     * Get all budgets for a given academic year.
     */
    public function getBudgetsForYear(int $yearId): array
    {
        return $this->db->fetchAll(
            "SELECT 
                ec.id as category_id,
                ec.name as category_name,
                COALESCE(eb.amount, 0) as amount,
                COALESCE((SELECT SUM(amount) FROM `expenses` WHERE category_id = ec.id AND academic_year_id = ?), 0) as spent
             FROM `expense_categories` ec
             LEFT JOIN `expense_budgets` eb ON eb.category_id = ec.id AND eb.academic_year_id = ?",
            [$yearId, $yearId]
        );
    }

    /**
     * Upsert a budget for a category in a year.
     */
    public function upsertBudget(int $yearId, int $categoryId, float $amount, int $createdBy): void
    {
        $this->db->execute(
            "INSERT INTO `expense_budgets` (academic_year_id, category_id, amount, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, NOW(), NOW())
             ON DUPLICATE KEY UPDATE amount = VALUES(amount), updated_at = NOW()",
            [$yearId, $categoryId, $amount, $createdBy]
        );
    }
}
