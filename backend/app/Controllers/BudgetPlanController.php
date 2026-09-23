<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Models\BudgetPlanModel;
use App\Helpers\BudgetPlanExcel;
use App\Helpers\ValidationHelper;
use App\Services\SystemLogService;

/**
 * Financial Budget Plan (migration 106/107) — full institution revenue +
 * expense + capex/financing/arrears model, distinct from the per-department
 * Budget Execution feature in BudgetController.
 */
class BudgetPlanController extends BaseController
{
    private BudgetPlanModel $model;
    private Database        $db;

    public function __construct()
    {
        $this->model = new BudgetPlanModel();
        $this->db    = Database::getInstance();
    }

    private function loadPlan(int $academicYearId): ?array
    {
        $plan = $this->model->getPlanByYear($academicYearId);
        if (!$plan) return null;

        $plan['line_items']          = $this->model->getLineItems((int)$plan['id']);
        $plan['student_projections'] = $this->model->getStudentProjections((int)$plan['id']);
        $plan['student_executions']  = $this->model->getStudentExecutions((int)$plan['id']);
        $plan['reference_rates']     = $this->model->getReferenceRates((int)$plan['id']);
        $plan['month_names']         = BudgetPlanModel::monthNames();
        return $plan;
    }

    private function yearLabel(int $yearId): string
    {
        $year = $this->db->fetchOne("SELECT label FROM `academic_years` WHERE id = ?", [$yearId]);
        return $year['label'] ?? 'Academic Year';
    }

    /** GET /api/finance/budget-plan?academic_year_id= */
    public function show(Request $request, Response $response): never
    {
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) $this->error($response, 'academic_year_id is required.', 422);

        $plan = $this->loadPlan($yearId);
        if (!$plan) $this->error($response, 'No financial plan found for that academic year.', 404);

        $this->success($response, $plan, 'Financial plan retrieved.');
    }

    /** GET /api/finance/budget-plan/export?academic_year_id= */
    public function export(Request $request, Response $response): never
    {
        $actor  = $request->param('_auth_user');
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) $this->error($response, 'academic_year_id is required.', 422);

        $plan = $this->loadPlan($yearId);
        if (!$plan) $this->error($response, 'No financial plan found for that academic year.', 404);

        SystemLogService::log('EXPORT', 'FINANCE', "Exported financial plan for year {$yearId}.", null, 'budget_plan', ['academic_year_id' => $yearId], (array) $actor ?: null);

        $filename = "Financial-Plan-{$plan['academic_year_label']}-" . date('Y-m-d') . '.xlsx';
        BudgetPlanExcel::streamWorkbook($plan, $filename);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Plan lifecycle — initialize / update
    // ──────────────────────────────────────────────────────────────────────────

    /** POST /api/finance/budget-plan — initialize a new (empty) plan for a year. */
    public function create(Request $request, Response $response): never
    {
        $actor = $request->param('_auth_user');
        $data  = $request->body();

        $errors = ValidationHelper::validate($data, [
            'academic_year_id' => 'required|numeric',
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        $yearId = (int)$data['academic_year_id'];
        if ($this->model->getPlanByYear($yearId)) {
            $this->error($response, 'A financial plan already exists for that academic year.', 409);
        }

        $title = trim((string)($data['title'] ?? '')) ?: 'Financial Budget for Academic year ' . str_replace('/', '-', $this->yearLabel($yearId));
        $studentCount = isset($data['student_count_budgeted']) && $data['student_count_budgeted'] !== ''
            ? (int)$data['student_count_budgeted'] : null;

        $planId = $this->model->createPlan($yearId, $title, $studentCount);

        SystemLogService::log('CREATE', 'FINANCE', "Initialized financial plan for year {$yearId}.", null, 'budget_plan', ['academic_year_id' => $yearId], (array) $actor ?: null);
        $this->success($response, ['id' => $planId], 'Financial plan created.', 201);
    }

    /** POST /api/finance/budget-plan/:id — update plan title / budgeted student count. */
    public function update(Request $request, Response $response): never
    {
        $actor = $request->param('_auth_user');
        $id    = (int)$request->param('id');
        $data  = $request->body();

        if (!$this->model->find($id)) $this->error($response, 'Financial plan not found.', 404);

        $update = [];
        if (array_key_exists('title', $data)) $update['title'] = trim((string)$data['title']);
        if (array_key_exists('student_count_budgeted', $data)) {
            $update['student_count_budgeted'] = $data['student_count_budgeted'] !== '' ? (int)$data['student_count_budgeted'] : null;
        }

        $this->model->updatePlan($id, $update);

        SystemLogService::log('UPDATE', 'FINANCE', "Updated financial plan {$id}.", null, 'budget_plan', ['id' => $id], (array) $actor ?: null);
        $this->success($response, null, 'Financial plan updated.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Line items — create / update / delete
    // ──────────────────────────────────────────────────────────────────────────

    private function lineItemPayload(array $data): array
    {
        $payload = [];
        foreach (['section', 'label', 'row_type'] as $f) {
            if (array_key_exists($f, $data)) $payload[$f] = $data[$f];
        }
        if (array_key_exists('general_total', $data)) {
            $payload['general_total'] = $data['general_total'] !== '' && $data['general_total'] !== null ? (float)$data['general_total'] : null;
        }
        if (array_key_exists('executed_total', $data)) {
            $payload['executed_total'] = $data['executed_total'] !== '' && $data['executed_total'] !== null ? (float)$data['executed_total'] : null;
        }
        if (array_key_exists('months', $data) && is_array($data['months'])) {
            $months = [];
            foreach ($data['months'] as $m => $v) {
                if ($v !== '' && $v !== null) $months[(int)$m] = (float)$v;
            }
            $payload['months'] = $months;
        }
        return $payload;
    }

    /** POST /api/finance/budget-plan/:planId/line-items — add a new row. */
    public function createLineItem(Request $request, Response $response): never
    {
        $actor  = $request->param('_auth_user');
        $planId = (int)$request->param('planId');
        $data   = $request->body();

        if (!$this->model->find($planId)) $this->error($response, 'Financial plan not found.', 404);

        $errors = ValidationHelper::validate($data, [
            'section' => 'required|in:' . implode(',', BudgetPlanExcel::SECTIONS),
            'label'   => 'required|string',
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        if (isset($data['row_type']) && !in_array($data['row_type'], BudgetPlanExcel::ROW_TYPES, true)) {
            $this->error($response, 'Validation failed.', 422, ['row_type' => ['Invalid row type.']]);
        }

        $lineItemId = $this->model->createLineItem($planId, $this->lineItemPayload($data));

        SystemLogService::log('CREATE', 'FINANCE', "Added budget line item to plan {$planId}: {$data['label']}.", null, 'budget_line_item', ['budget_plan_id' => $planId], (array) $actor ?: null);
        $this->success($response, ['id' => $lineItemId], 'Line item created.', 201);
    }

    /** POST /api/finance/budget-plan/line-items/:id — update a row's fields/monthly values. */
    public function updateLineItem(Request $request, Response $response): never
    {
        $actor = $request->param('_auth_user');
        $id    = (int)$request->param('id');
        $data  = $request->body();

        if (isset($data['section']) && !in_array($data['section'], BudgetPlanExcel::SECTIONS, true)) {
            $this->error($response, 'Validation failed.', 422, ['section' => ['Invalid section.']]);
        }
        if (isset($data['row_type']) && !in_array($data['row_type'], BudgetPlanExcel::ROW_TYPES, true)) {
            $this->error($response, 'Validation failed.', 422, ['row_type' => ['Invalid row type.']]);
        }

        $this->model->updateLineItem($id, $this->lineItemPayload($data));

        SystemLogService::log('UPDATE', 'FINANCE', "Updated budget line item {$id}.", null, 'budget_line_item', ['id' => $id], (array) $actor ?: null);
        $this->success($response, null, 'Line item updated.');
    }

    /** DELETE /api/finance/budget-plan/line-items/:id */
    public function deleteLineItem(Request $request, Response $response): never
    {
        $actor = $request->param('_auth_user');
        $id    = (int)$request->param('id');

        $this->model->deleteLineItem($id);

        SystemLogService::log('DELETE', 'FINANCE', "Deleted budget line item {$id}.", null, 'budget_line_item', ['id' => $id], (array) $actor ?: null);
        $this->success($response, null, 'Line item deleted.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Template download / bulk upload
    // ──────────────────────────────────────────────────────────────────────────

    /** GET /api/finance/budget-plan/template?academic_year_id= */
    public function downloadTemplate(Request $request, Response $response): never
    {
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) $this->error($response, 'academic_year_id is required.', 422);

        $plan = $this->loadPlan($yearId);
        $label = $this->yearLabel($yearId);
        $filename = "Financial-Plan-Template-{$label}.xlsx";
        BudgetPlanExcel::streamTemplate($plan, $filename);
    }

    /**
     * POST /api/finance/budget-plan/import?academic_year_id= (multipart, field "file")
     * Creates the plan for that year if it doesn't exist yet, then upserts
     * every row in the uploaded template (matched by ID, or by section+label
     * when ID is blank/unknown).
     */
    public function import(Request $request, Response $response): never
    {
        $actor  = $request->param('_auth_user');
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) $this->error($response, 'academic_year_id is required.', 422);

        $file = $request->file('file');
        if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
            $this->error($response, 'No file uploaded or upload error.', 400);
        }

        try {
            $rows = BudgetPlanExcel::parseTemplate($file['tmp_name']);
        } catch (\InvalidArgumentException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        if (empty($rows)) {
            $this->error($response, 'Template contains no data rows.', 422);
        }

        $plan = $this->model->getPlanByYear($yearId);
        $planId = $plan ? (int)$plan['id'] : $this->model->createPlan(
            $yearId,
            'Financial Budget for Academic year ' . str_replace('/', '-', $this->yearLabel($yearId)),
            null
        );

        $created = 0;
        $updated = 0;
        foreach ($rows as $row) {
            $lineItemId = $row['id'] && $this->model->lineItemBelongsToPlan($row['id'], $planId)
                ? $row['id']
                : $this->model->findLineItemByLabel($planId, $row['section'], $row['label']);

            $payload = [
                'section'        => $row['section'],
                'label'          => $row['label'],
                'row_type'       => $row['row_type'],
                'months'         => $row['months'],
                'general_total'  => $row['general_total'],
                'executed_total' => $row['executed_total'],
            ];

            if ($lineItemId) {
                $this->model->updateLineItem($lineItemId, $payload);
                $updated++;
            } else {
                $this->model->createLineItem($planId, $payload);
                $created++;
            }
        }

        SystemLogService::log('IMPORT', 'FINANCE', "Imported financial plan template for year {$yearId}: {$created} created, {$updated} updated.", null, 'budget_plan', ['academic_year_id' => $yearId], (array) $actor ?: null);
        $this->success($response, ['plan_id' => $planId, 'created' => $created, 'updated' => $updated], 'Financial plan imported.');
    }
}
