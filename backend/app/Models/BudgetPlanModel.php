<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Financial Budget Plan (migration 106/107) — the full institution revenue +
 * expense + capex/financing/arrears model imported from the "UNIVERSITY
 * BUDGET" Excel workbooks, distinct from the per-department ExpenseBudgetModel.
 */
class BudgetPlanModel extends BaseModel
{
    protected string $table      = 'budget_plans';
    protected string $primaryKey = 'id';
    protected array  $fillable   = ['academic_year_id', 'title', 'student_count_budgeted'];

    private const MONTH_NAMES = [
        1 => 'September', 2 => 'October', 3 => 'November', 4 => 'December',
        5 => 'January', 6 => 'February', 7 => 'March', 8 => 'April',
        9 => 'May', 10 => 'June', 11 => 'July', 12 => 'August',
    ];

    public static function monthNames(): array
    {
        return self::MONTH_NAMES;
    }

    public function getPlanByYear(int $academicYearId): ?array
    {
        $row = $this->db->fetchOne(
            "SELECT bp.*, ay.label as academic_year_label
             FROM `budget_plans` bp
             JOIN `academic_years` ay ON ay.id = bp.academic_year_id
             WHERE bp.academic_year_id = ?",
            [$academicYearId]
        );
        return $row ?: null;
    }

    /**
     * Ordered line items with their monthly breakdown and (if present) an
     * annual execution figure. One row per budget_line_items entry, months
     * keyed 1..12 (September..August) so callers don't need month-name lookup.
     */
    public function getLineItems(int $budgetPlanId): array
    {
        $items = $this->db->fetchAll(
            "SELECT id, parent_id, section, label, row_type, sort_order, general_total
             FROM `budget_line_items`
             WHERE budget_plan_id = ?
             ORDER BY sort_order",
            [$budgetPlanId]
        );
        if (!$items) return [];

        $ids = array_column($items, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));

        $monthly = $this->db->fetchAll(
            "SELECT line_item_id, month, amount FROM `budget_line_item_monthly_values`
             WHERE line_item_id IN ($placeholders)",
            $ids
        );
        $monthlyByItem = [];
        foreach ($monthly as $m) {
            $monthlyByItem[$m['line_item_id']][(int)$m['month']] = (float)$m['amount'];
        }

        $executions = $this->db->fetchAll(
            "SELECT line_item_id, executed_total FROM `budget_line_item_executions`
             WHERE line_item_id IN ($placeholders)",
            $ids
        );
        $executionByItem = [];
        foreach ($executions as $e) {
            $executionByItem[$e['line_item_id']] = (float)$e['executed_total'];
        }

        foreach ($items as &$item) {
            $item['general_total'] = $item['general_total'] !== null ? (float)$item['general_total'] : null;
            $item['months']        = $monthlyByItem[$item['id']] ?? [];
            $executed               = $executionByItem[$item['id']] ?? null;
            $item['executed_total'] = $executed;
            $item['variance']       = $executed !== null && $item['general_total'] !== null
                ? $executed - $item['general_total'] : null;
            $item['pct_realisation'] = $executed !== null && $item['general_total']
                ? round(($executed / $item['general_total']) * 100, 2) : null;
        }
        unset($item);

        return $items;
    }

    public function getStudentProjections(int $budgetPlanId): array
    {
        return $this->db->fetchAll(
            "SELECT faculty_label, department_label, level_label, program_type, intake_period, headcount, sort_order
             FROM `budget_student_projections`
             WHERE budget_plan_id = ?
             ORDER BY sort_order",
            [$budgetPlanId]
        );
    }

    public function getStudentExecutions(int $budgetPlanId): array
    {
        return $this->db->fetchAll(
            "SELECT faculty_code, budgeted, executed, rank, sort_order
             FROM `budget_student_executions`
             WHERE budget_plan_id = ?
             ORDER BY sort_order",
            [$budgetPlanId]
        );
    }

    public function getReferenceRates(int $budgetPlanId): array
    {
        return $this->db->fetchAll(
            "SELECT rate_group, label, value1, value2, value3, sort_order
             FROM `budget_reference_rates`
             WHERE budget_plan_id = ?
             ORDER BY rate_group, sort_order",
            [$budgetPlanId]
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Write — plan lifecycle
    // ──────────────────────────────────────────────────────────────────────────

    /** Create a brand-new (empty) budget plan for an academic year. */
    public function createPlan(int $academicYearId, string $title, ?int $studentCountBudgeted): int
    {
        return (int)$this->create([
            'academic_year_id'       => $academicYearId,
            'title'                  => $title,
            'student_count_budgeted' => $studentCountBudgeted,
        ]);
    }

    public function updatePlan(int $planId, array $data): void
    {
        $fields = array_intersect_key($data, array_flip(['title', 'student_count_budgeted']));
        if ($fields) {
            $this->update($planId, $fields);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Write — line items
    // ──────────────────────────────────────────────────────────────────────────

    private function nextSortOrder(int $budgetPlanId): int
    {
        $row = $this->db->fetchOne(
            "SELECT COALESCE(MAX(sort_order), 0) as max_order FROM `budget_line_items` WHERE budget_plan_id = ?",
            [$budgetPlanId]
        );
        return (int)($row['max_order'] ?? 0) + 1;
    }

    /**
     * Create a line item row plus its optional monthly values/execution total.
     * $months is keyed 1..12 (September..August). Returns the new line item id.
     */
    public function createLineItem(int $budgetPlanId, array $data): int
    {
        $sortOrder = $data['sort_order'] ?? $this->nextSortOrder($budgetPlanId);

        $this->db->execute(
            "INSERT INTO `budget_line_items` (budget_plan_id, parent_id, section, label, row_type, sort_order, general_total)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                $budgetPlanId,
                $data['parent_id'] ?? null,
                $data['section'],
                $data['label'],
                $data['row_type'] ?? 'data',
                $sortOrder,
                $data['general_total'] ?? null,
            ]
        );
        $lineItemId = (int)$this->db->lastInsertId();

        $this->replaceMonthlyValues($lineItemId, $data['months'] ?? []);
        if (array_key_exists('executed_total', $data) && $data['executed_total'] !== null) {
            $this->upsertExecution($lineItemId, (float)$data['executed_total']);
        }

        return $lineItemId;
    }

    /** Update a line item's own fields and, when provided, its monthly/execution figures. */
    public function updateLineItem(int $lineItemId, array $data): void
    {
        $fields = array_intersect_key($data, array_flip(['section', 'label', 'row_type', 'sort_order', 'general_total', 'parent_id']));
        if ($fields) {
            $this->db->execute(
                "UPDATE `budget_line_items` SET " . implode(', ', array_map(fn($c) => "`{$c}` = ?", array_keys($fields))) . " WHERE id = ?",
                [...array_values($fields), $lineItemId]
            );
        }

        if (array_key_exists('months', $data) && is_array($data['months'])) {
            $this->replaceMonthlyValues($lineItemId, $data['months']);
        }

        if (array_key_exists('executed_total', $data)) {
            if ($data['executed_total'] === null) {
                $this->db->execute("DELETE FROM `budget_line_item_executions` WHERE line_item_id = ?", [$lineItemId]);
            } else {
                $this->upsertExecution($lineItemId, (float)$data['executed_total']);
            }
        }
    }

    public function deleteLineItem(int $lineItemId): void
    {
        // budget_line_item_monthly_values / _executions cascade via FK,
        // as do any child rows that used this item as parent_id.
        $this->db->execute("DELETE FROM `budget_line_items` WHERE id = ?", [$lineItemId]);
    }

    public function lineItemBelongsToPlan(int $lineItemId, int $budgetPlanId): bool
    {
        $row = $this->db->fetchOne(
            "SELECT id FROM `budget_line_items` WHERE id = ? AND budget_plan_id = ?",
            [$lineItemId, $budgetPlanId]
        );
        return (bool)$row;
    }

    /** Replace all monthly values for a line item with the given month => amount map. */
    private function replaceMonthlyValues(int $lineItemId, array $months): void
    {
        $this->db->execute("DELETE FROM `budget_line_item_monthly_values` WHERE line_item_id = ?", [$lineItemId]);
        foreach ($months as $month => $amount) {
            if ($amount === null || $amount === '') continue;
            $this->db->execute(
                "INSERT INTO `budget_line_item_monthly_values` (line_item_id, month, amount) VALUES (?, ?, ?)",
                [$lineItemId, (int)$month, (float)$amount]
            );
        }
    }

    private function upsertExecution(int $lineItemId, float $executedTotal): void
    {
        $existing = $this->db->fetchOne(
            "SELECT id FROM `budget_line_item_executions` WHERE line_item_id = ?",
            [$lineItemId]
        );
        if ($existing) {
            $this->db->execute(
                "UPDATE `budget_line_item_executions` SET executed_total = ? WHERE line_item_id = ?",
                [$executedTotal, $lineItemId]
            );
        } else {
            $this->db->execute(
                "INSERT INTO `budget_line_item_executions` (line_item_id, executed_total) VALUES (?, ?)",
                [$lineItemId, $executedTotal]
            );
        }
    }

    /**
     * Find a line item id within a plan by (section, label) — used to match
     * uploaded template rows against existing line items so a re-upload
     * updates in place instead of creating duplicates.
     */
    public function findLineItemByLabel(int $budgetPlanId, string $section, string $label): ?int
    {
        $row = $this->db->fetchOne(
            "SELECT id FROM `budget_line_items` WHERE budget_plan_id = ? AND section = ? AND label = ? LIMIT 1",
            [$budgetPlanId, $section, $label]
        );
        return $row ? (int)$row['id'] : null;
    }
}
