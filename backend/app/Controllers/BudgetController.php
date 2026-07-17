<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Models\ExpenseBudgetModel;
use App\Services\SystemLogService;
use App\Helpers\ValidationHelper;

/**
 * Budget Execution module (Phase 4). Promoted out of FeeController's
 * expense-budget helpers so this can grow (department scoping, comparison,
 * export) without further overloading FeeController.
 */
class BudgetController extends BaseController
{
    private ExpenseBudgetModel $budgetModel;
    private Database           $db;

    public function __construct()
    {
        $this->budgetModel = new ExpenseBudgetModel();
        $this->db          = Database::getInstance();
    }

    private function departmentIdParam(Request $request): ?int
    {
        $raw = $request->query('department_id');
        return $raw !== null && $raw !== '' ? (int)$raw : null;
    }

    private function yearLabel(int $yearId): string
    {
        $year = $this->db->fetchOne("SELECT label FROM `academic_years` WHERE id = ?", [$yearId]);
        return $year['label'] ?? 'Academic Year';
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Legacy budget plan (Expenses > Budget Plan tab) — institution-wide only
    // ──────────────────────────────────────────────────────────────────────────

    /** GET /api/finance/budgets */
    public function listBudgets(Request $request, Response $response): never
    {
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) $this->error($response, 'academic_year_id required.', 422);

        $this->success($response, $this->budgetModel->getBudgetsForYear($yearId), 'Budgets retrieved.');
    }

    /** POST /api/finance/budgets */
    public function saveBudget(Request $request, Response $response): never
    {
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'academic_year_id' => 'required|numeric',
            'category_id'      => 'required|numeric',
            'amount'           => 'required|numeric',
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        $departmentId = !empty($data['department_id']) ? (int)$data['department_id'] : null;

        $this->budgetModel->upsertBudget(
            (int)$data['academic_year_id'],
            (int)$data['category_id'],
            (float)$data['amount'],
            (int)$actor['id'],
            $departmentId
        );

        SystemLogService::log('UPDATE', 'FINANCE', "Saved expense budget for category {$data['category_id']} (year {$data['academic_year_id']}): {$data['amount']}.", null, 'expense_budget', ['category_id' => (int) $data['category_id'], 'department_id' => $departmentId, 'amount' => (float) $data['amount']], (array) $actor ?: null);
        $this->success($response, null, 'Budget saved.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Budget Execution report
    // ──────────────────────────────────────────────────────────────────────────

    /** GET /api/finance/budget-execution?academic_year_id=&department_id= */
    public function listByYear(Request $request, Response $response): never
    {
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) $this->error($response, 'academic_year_id is required.', 422);

        $rows = $this->budgetModel->getExecutionReport($yearId, $this->departmentIdParam($request));
        $this->success($response, $rows, 'Budget execution report retrieved.');
    }

    /** GET /api/finance/budget-execution/compare?year_a=&year_b=&department_id= */
    public function compare(Request $request, Response $response): never
    {
        $yearA = (int)($request->query('year_a') ?? 0);
        $yearB = (int)($request->query('year_b') ?? 0);
        if (!$yearA || !$yearB) $this->error($response, 'year_a and year_b are required.', 422);

        $departmentId = $this->departmentIdParam($request);

        $this->success($response, [
            'year_a' => ['academic_year_id' => $yearA, 'label' => $this->yearLabel($yearA), 'rows' => $this->budgetModel->getExecutionReport($yearA, $departmentId)],
            'year_b' => ['academic_year_id' => $yearB, 'label' => $this->yearLabel($yearB), 'rows' => $this->budgetModel->getExecutionReport($yearB, $departmentId)],
        ], 'Budget comparison retrieved.');
    }

    /** GET /api/finance/budget-execution/export?academic_year_id=&department_id=&format=xlsx|pdf */
    public function export(Request $request, Response $response): never
    {
        $actor  = $request->param('_auth_user');
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) $this->error($response, 'academic_year_id is required.', 422);

        $departmentId = $this->departmentIdParam($request);
        $format       = strtolower((string)($request->query('format') ?? 'xlsx'));
        $yearLabel    = $this->yearLabel($yearId);
        $rows         = $this->budgetModel->getExecutionReport($yearId, $departmentId);

        SystemLogService::log('EXPORT', 'FINANCE', "Exported budget execution report for year {$yearId}.", null, 'expense_budget', array_filter(['department_id' => $departmentId]), (array) $actor ?: null);

        if ($format === 'pdf') {
            \App\Helpers\BudgetExecutionPdf::streamPdf($rows, ['academic_year' => $yearLabel], "Budget-Execution-{$yearLabel}.pdf");
        }

        // "Excel" export follows this codebase's existing convention (see
        // FeeController::exportReport/exportBillingSummary) of a CSV payload
        // rather than adding a PhpSpreadsheet dependency for a true .xlsx.
        $headers = ['Category', 'Department', 'Planned Budget (RWF)', 'Amount Spent (RWF)', 'Balance (RWF)', 'Variance (RWF)', 'Overspend'];
        $filename = "Budget-Execution-{$yearLabel}-" . date('Y-m-d') . '.csv';

        ob_start();
        $out = fopen('php://output', 'w');
        fputcsv($out, $headers);
        foreach ($rows as $r) {
            fputcsv($out, [
                $r['category_name'],
                $r['department_name'] ?? 'All Departments',
                $r['planned_budget'],
                $r['amount_spent'],
                $r['balance'],
                $r['variance'],
                $r['is_overspend'] ? 'YES' : 'NO',
            ]);
        }
        fclose($out);
        $csv = ob_get_clean();

        header('Content-Type: text/csv; charset=utf-8');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");
        header('Cache-Control: no-cache');
        echo $csv;
        exit;
    }
}
