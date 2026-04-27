<?php

declare(strict_types=1);

namespace App\Models;



class ExpenseCategoryModel extends BaseModel
{
    protected string $table      = 'expense_categories';
    protected string $primaryKey = 'id';

    public function listAll(): array
    {
        return $this->db->fetchAll(
            "SELECT ec.*, COUNT(e.id) AS expense_count
             FROM `expense_categories` ec
             LEFT JOIN `expenses` e ON e.category_id = ec.id
             GROUP BY ec.id
             ORDER BY ec.name ASC"
        );
    }
}
