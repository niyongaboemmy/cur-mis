<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\AppraisalModel;
use App\Models\HrEmployeeModel;
use App\Helpers\ValidationHelper;

class AppraisalController extends BaseController
{
    private AppraisalModel  $model;
    private HrEmployeeModel $empModel;

    public function __construct()
    {
        $this->model    = new AppraisalModel();
        $this->empModel = new HrEmployeeModel();
    }

    /* ══════════════════════════════════════════════════════════════════════
     * STATS
     * ════════════════════════════════════════════════════════════════════ */

    /** GET /api/appraisals/stats */
    public function stats(Request $request, Response $response): never
    {
        $this->success($response, $this->model->stats());
    }

    /* ══════════════════════════════════════════════════════════════════════
     * PERIODS
     * ════════════════════════════════════════════════════════════════════ */

    /** GET /api/appraisals/periods */
    public function listPeriods(Request $request, Response $response): never
    {
        $filters = [
            'status' => $request->query('status') ?? '',
            'year'   => $request->query('year')   ?? '',
        ];
        $this->success($response, $this->model->listPeriods($filters));
    }

    /** POST /api/appraisals/periods */
    public function createPeriod(Request $request, Response $response): never
    {
        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'title'       => ['required'],
            'period_type' => ['required'],
            'year'        => ['required'],
            'start_date'  => ['required'],
            'end_date'    => ['required'],
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed', 422, $errors);

        $validTypes = ['Annual','Semi-Annual','Quarterly','Custom'];
        if (!in_array($data['period_type'] ?? '', $validTypes, true)) {
            $this->error($response, 'Invalid period_type', 422);
        }

        $id  = $this->model->createPeriod($data);
        $row = $this->model->findPeriod($id);
        $this->success($response, $row, 'Appraisal period created.', 201);
    }

    /** PUT /api/appraisals/periods/:id */
    public function updatePeriod(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->model->findPeriod($id);
        if (!$row) $this->error($response, 'Period not found', 404);

        $data = $request->body();
        $this->model->updatePeriod($id, $data);
        $this->success($response, $this->model->findPeriod($id), 'Period updated.');
    }

    /** PATCH /api/appraisals/periods/:id/status */
    public function setPeriodStatus(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->model->findPeriod($id);
        if (!$row) $this->error($response, 'Period not found', 404);

        $status = trim((string)($request->body()['status'] ?? ''));
        if (!in_array($status, ['Draft','Active','Closed'], true)) {
            $this->error($response, 'Invalid status', 422);
        }

        $this->model->updatePeriod($id, ['status' => $status]);
        $this->success($response, ['status' => $status], 'Status updated.');
    }

    /** DELETE /api/appraisals/periods/:id */
    public function deletePeriod(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->model->findPeriod($id);
        if (!$row) $this->error($response, 'Period not found', 404);

        if ((int)$row['appraisal_count'] > 0) {
            $this->error($response, 'Cannot delete a period with existing appraisals.', 409);
        }

        $this->model->deletePeriod($id);
        $this->success($response, null, 'Period deleted.');
    }

    /* ══════════════════════════════════════════════════════════════════════
     * CRITERIA
     * ════════════════════════════════════════════════════════════════════ */

    /** GET /api/appraisals/periods/:id/criteria */
    public function listCriteria(Request $request, Response $response): never
    {
        $periodId = (int)$request->param('id');
        if (!$this->model->findPeriod($periodId)) $this->error($response, 'Period not found', 404);

        $this->success($response, $this->model->listCriteria($periodId));
    }

    /** POST /api/appraisals/periods/:id/criteria */
    public function createCriterion(Request $request, Response $response): never
    {
        $periodId = (int)$request->param('id');
        if (!$this->model->findPeriod($periodId)) $this->error($response, 'Period not found', 404);

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, ['name' => ['required']]);
        if (!empty($errors)) $this->error($response, 'Validation failed', 422, $errors);

        $data['period_id'] = $periodId;
        $id  = $this->model->createCriterion($data);
        $this->success($response, ['id' => $id] + $data, 'Criterion added.', 201);
    }

    /** PUT /api/appraisals/periods/:id/criteria/:cid */
    public function updateCriterion(Request $request, Response $response): never
    {
        $cid  = (int)$request->param('cid');
        $data = $request->body();
        $this->model->updateCriterion($cid, $data);
        $this->success($response, null, 'Criterion updated.');
    }

    /** DELETE /api/appraisals/periods/:id/criteria/:cid */
    public function deleteCriterion(Request $request, Response $response): never
    {
        $cid = (int)$request->param('cid');
        $this->model->deleteCriterion($cid);
        $this->success($response, null, 'Criterion deleted.');
    }

    /* ══════════════════════════════════════════════════════════════════════
     * APPRAISAL RECORDS
     * ════════════════════════════════════════════════════════════════════ */

    /** GET /api/appraisals */
    public function listAppraisals(Request $request, Response $response): never
    {
        $filters = [
            'period_id'   => $request->query('period_id')   ?? '',
            'employee_id' => $request->query('employee_id') ?? '',
            'status'      => $request->query('status')      ?? '',
        ];
        $this->success($response, $this->model->listAppraisals($filters));
    }

    /** POST /api/appraisals/periods/:id/initiate  — create appraisal rows for all active employees */
    public function initiate(Request $request, Response $response): never
    {
        $periodId = (int)$request->param('id');
        $period   = $this->model->findPeriod($periodId);
        if (!$period) $this->error($response, 'Period not found', 404);

        $result = $this->model->initiateAppraisals($periodId);
        $this->success($response, $result, "Appraisals initiated: {$result['created']} created, {$result['skipped']} skipped.");
    }

    /** GET /api/appraisals/:id */
    public function showAppraisal(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->model->findAppraisal($id);
        if (!$row) $this->error($response, 'Appraisal not found', 404);
        $this->success($response, $row);
    }

    /* ── Self-assessment ─────────────────────────────────────────────────── */

    /** PATCH /api/appraisals/:id/self */
    public function saveSelf(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->model->findAppraisal($id);
        if (!$row) $this->error($response, 'Appraisal not found', 404);

        if (!in_array($row['status'], ['Draft','Self-Review'], true)) {
            $this->error($response, 'Self-assessment not allowed in current status.', 422);
        }

        $data    = $request->body();
        $ratings = $data['ratings'] ?? [];

        foreach ($ratings as $r) {
            if (empty($r['criterion_id'])) continue;
            $this->model->upsertRating($id, (int)$r['criterion_id'], [
                'self_score'   => isset($r['self_score'])   ? (int)$r['self_score']   : null,
                'self_comment' => $r['self_comment'] ?? null,
            ]);
        }

        $selfScore = $this->model->computeScore($id, 'self');

        $update = [
            'status'           => 'Self-Review',
            'self_comment'     => $data['self_comment'] ?? $row['self_comment'],
            'self_total_score' => $selfScore,
        ];

        if (!empty($data['submit'])) {
            $update['status']       = 'Supervisor-Review';
            $update['submitted_at'] = date('Y-m-d H:i:s');
        }

        $this->model->update($id, $update);
        $this->success($response, $this->model->findAppraisal($id), 'Self-assessment saved.');
    }

    /* ── Supervisor review ───────────────────────────────────────────────── */

    /** PATCH /api/appraisals/:id/supervisor */
    public function saveSupervisor(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->model->findAppraisal($id);
        if (!$row) $this->error($response, 'Appraisal not found', 404);

        if (!in_array($row['status'], ['Supervisor-Review'], true)) {
            $this->error($response, 'Supervisor review not allowed in current status.', 422);
        }

        $data    = $request->body();
        $ratings = $data['ratings'] ?? [];

        foreach ($ratings as $r) {
            if (empty($r['criterion_id'])) continue;
            $this->model->upsertRating($id, (int)$r['criterion_id'], [
                'supervisor_score'   => isset($r['supervisor_score'])   ? (int)$r['supervisor_score']   : null,
                'supervisor_comment' => $r['supervisor_comment'] ?? null,
            ]);
        }

        $supScore = $this->model->computeScore($id, 'supervisor');

        $update = [
            'supervisor_comment'     => $data['supervisor_comment'] ?? $row['supervisor_comment'],
            'supervisor_total_score' => $supScore,
        ];

        if (!empty($data['submit'])) {
            $update['status']                  = 'HR-Review';
            $update['supervisor_reviewed_at']  = date('Y-m-d H:i:s');
        }

        $this->model->update($id, $update);
        $this->success($response, $this->model->findAppraisal($id), 'Supervisor review saved.');
    }

    /* ── HR review & complete ────────────────────────────────────────────── */

    /** PATCH /api/appraisals/:id/hr */
    public function saveHr(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->model->findAppraisal($id);
        if (!$row) $this->error($response, 'Appraisal not found', 404);

        if (!in_array($row['status'], ['HR-Review','Completed'], true)) {
            $this->error($response, 'HR review not allowed in current status.', 422);
        }

        $data = $request->body();

        $finalScore = $data['final_score'] ?? $row['supervisor_total_score'] ?? $row['self_total_score'];
        $grade      = $this->deriveGrade((float)$finalScore);

        $update = [
            'hr_comment'  => $data['hr_comment'] ?? $row['hr_comment'],
            'final_score' => $finalScore,
            'final_grade' => $data['final_grade'] ?? $grade,
        ];

        if (!empty($data['complete'])) {
            $update['status']       = 'Completed';
            $update['completed_at'] = date('Y-m-d H:i:s');
        }

        $this->model->update($id, $update);
        $this->success($response, $this->model->findAppraisal($id), 'HR review saved.');
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private function deriveGrade(float $score): string
    {
        if ($score >= 4.5) return 'Excellent';
        if ($score >= 3.5) return 'Good';
        if ($score >= 2.5) return 'Satisfactory';
        return 'Needs Improvement';
    }
}
