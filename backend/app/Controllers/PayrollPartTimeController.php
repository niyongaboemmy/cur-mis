<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Payroll\PartTime\PartTimeDocuments;
use App\Payroll\PartTime\PartTimeRules;
use App\Payroll\PartTime\PartTimeWorkflow;
use App\Payroll\Reports\PayrollPdf;
use App\Payroll\Runs\PayrollRunService;
use App\Payroll\Runs\RunTransitionException;
use Core\Database;
use Core\Request;
use Core\Response;
use InvalidArgumentException;

/**
 * Part-time module assignments and their documents. See routes/api/payroll-runs.php for the permissions.
 */
class PayrollPartTimeController extends BaseController
{
    private function db(): Database
    {
        return Database::getInstance();
    }

    private function workflow(): PartTimeWorkflow
    {
        $db = $this->db();
        return new PartTimeWorkflow($db, new PayrollRunService($db));
    }

    private function actor(Request $request, Response $response): int
    {
        $id = (int) (((array) ($request->param('_auth_user') ?? []))['id'] ?? 0);
        if ($id <= 0) {
            $this->error($response, 'You must be signed in to change payroll.', 401);
        }
        return $id;
    }

    /** @param callable(): mixed $action */
    private function attempt(Response $response, string $message, callable $action): never
    {
        try {
            $result = $action();
        } catch (RunTransitionException $e) {
            $this->error($response, $e->getMessage(), 409);
        } catch (InvalidArgumentException $e) {
            $this->error($response, $e->getMessage(), 422);
        }
        $this->success($response, $result ?? null, $message);
    }

    /** GET /api/hr/payroll/part-time?status=REQUESTED */
    public function index(Request $request, Response $response): never
    {
        $status = (string) ($request->query('status') ?? '');
        $sql = 'SELECT a.*, e.`employee_fname`, e.`employee_lname`
                  FROM `pt_assignments` a JOIN `employees` e ON e.`employee_id` = a.`employee_id`'
            . ($status !== '' ? ' WHERE a.`status` = ?' : '')
            . ' ORDER BY a.`period_start` DESC, a.`id` DESC';
        $this->success($response, $this->db()->fetchAll($sql, $status !== '' ? [$status] : []), 'Part-time assignments.');
    }

    /** POST /api/hr/payroll/part-time  (request a module) */
    public function request(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $body = $request->body();
        $this->attempt($response, 'Module requested.', function () use ($body, $actor) {
            return ['id' => $this->workflow()->request((int) ($body['employee_id'] ?? 0), $body, $actor)];
        });
    }

    /** POST /api/hr/payroll/part-time/{id}/hours  {hours, reason} */
    public function hours(Request $request, Response $response): never
    {
        $this->actor($request, $response);
        $id = (int) $request->param('id');
        $body = $request->body();
        $this->attempt($response, 'Hours updated.', function () use ($id, $body) {
            $this->workflow()->overrideHours($id, (string) ($body['hours'] ?? ''), (string) ($body['reason'] ?? ''));
            return null;
        });
    }

    /** POST /api/hr/payroll/part-time/{id}/advance  (DVCA approval, invitation, contract) */
    public function advance(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $id = (int) $request->param('id');
        $this->attempt($response, 'Assignment moved on.', function () use ($id, $actor) {
            return ['status' => $this->workflow()->advance($id, $actor)];
        });
    }

    /** POST /api/hr/payroll/part-time/{id}/send  {run_id} */
    public function send(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $id = (int) $request->param('id');
        $runId = (int) ($request->body()['run_id'] ?? 0);
        $this->attempt($response, 'Sent to payroll.', function () use ($id, $runId, $actor) {
            return ['line_id' => $this->workflow()->sendToPayroll($id, $runId, $actor)];
        });
    }

    /** GET /api/hr/payroll/part-time/{id}/reimbursement */
    public function reimbursement(Request $request, Response $response): never
    {
        $this->actor($request, $response);
        $id = (int) $request->param('id');
        $this->attempt($response, 'Accommodation and transport owed.', function () use ($id) {
            $workflow = $this->workflow();
            $assignment = $workflow->assignment($id);
            $settings = (new \App\Payroll\Settings\SettingsRepository($this->db()))->forDate(
                substr((string) $assignment['period_start'], 0, 7) . '-01'
            );
            return $workflow->reimbursement($assignment, $settings);
        });
    }

    /** GET /api/hr/payroll/part-time/{id}/invitation.pdf  and  .../contract.pdf */
    public function document(Request $request, Response $response): never
    {
        $this->actor($request, $response);
        $id = (int) $request->param('id');
        $kind = (string) $request->param('kind');
        if (!in_array($kind, ['invitation', 'contract'], true)) {
            $this->error($response, 'Document must be invitation or contract.', 404);
        }

        try {
            $assignment = $this->workflow()->assignment($id);
        } catch (InvalidArgumentException $e) {
            $this->error($response, $e->getMessage(), 404);
        }
        if ($kind === 'contract' && !in_array($assignment['status'], [PartTimeRules::CONTRACTED, PartTimeRules::SENT_TO_PAYROLL], true)) {
            $this->error($response, 'The contract is available once the invitation has been issued and accepted.', 409);
        }
        if ($kind === 'invitation' && $assignment['status'] === PartTimeRules::REQUESTED) {
            $this->error($response, 'The invitation is issued after DVCA approval.', 409);
        }

        $person = $this->db()->fetchOne('SELECT * FROM `employees` WHERE `employee_id` = ?', [(int) $assignment['employee_id']]) ?: [];
        $grade = $this->db()->fetchOne(
            'SELECT `grade_name`, `rate_per_hour` FROM `hourly_rates` WHERE `grade_code` = ? ORDER BY `effective_from` DESC LIMIT 1',
            [(string) $assignment['grade_code']]
        ) ?: ['grade_name' => (string) $assignment['grade_code'], 'rate_per_hour' => 0];

        $html = $kind === 'invitation'
            ? PartTimeDocuments::invitationHtml($assignment, $person, (string) $grade['grade_name'])
            : PartTimeDocuments::contractHtml($assignment, $person, (string) $grade['grade_name'], (int) round((float) $grade['rate_per_hour']));

        $pdf = PayrollPdf::render($html);
        if ($pdf === null) {
            $this->error($response, 'PDF rendering is not available on this server.', 503);
        }

        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="part-time-' . $kind . '-' . $id . '.pdf"');
        header('Cache-Control: no-store');
        echo $pdf;
        exit;
    }
}
