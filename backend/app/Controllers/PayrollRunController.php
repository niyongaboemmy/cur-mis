<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Payroll\Reports\BankTransferList;
use App\Payroll\Reports\PayrollPdf;
use App\Payroll\Reports\PayrollSheet;
use App\Payroll\Reports\PayrollWorkbook;
use App\Payroll\Reports\PayslipHtml;
use App\Payroll\Reports\StatutoryTotals;
use App\Payroll\Runs\PayrollRunService;
use App\Payroll\Runs\RunTransitionException;
use Core\Database;
use Core\Request;
use Core\Response;
use InvalidArgumentException;

/**
 * Payroll runs: list, create, lines, the workflow steps, exports and payslips.
 * Reads need VIEW_PAYROLL. Preparing needs MANAGE_PAYROLL. Approval, payment and reopening need APPROVE_PAYROLL.
 * See routes/api/payroll-runs.php.
 */
class PayrollRunController extends BaseController
{
    private function db(): Database
    {
        return Database::getInstance();
    }

    private function service(): PayrollRunService
    {
        return new PayrollRunService($this->db());
    }

    /** The signed-in user's id, placed on the request by AuthMiddleware. */
    private function actor(Request $request, Response $response): int
    {
        $id = (int) (((array) ($request->param('_auth_user') ?? []))['id'] ?? 0);
        if ($id <= 0) {
            $this->error($response, 'You must be signed in to change payroll.', 401);
        }
        return $id;
    }

    /**
     * Runs a payroll action and turns its errors into HTTP responses:
     * a forbidden state change is 409, invalid input is 422.
     *
     * @param callable(): mixed $action
     */
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

    /** GET /api/hr/payroll/runs?scheme=PERMANENT&status=APPROVED */
    public function index(Request $request, Response $response): never
    {
        $where = [];
        $bindings = [];
        foreach (['scheme' => 'scheme_code', 'status' => 'status'] as $param => $column) {
            $value = $request->query($param);
            if ($value !== null && $value !== '') {
                $where[] = "`{$column}` = ?";
                $bindings[] = (string) $value;
            }
        }
        $sql = 'SELECT `id`, `scheme_code`, `period_date`, `title`, `status`, `created_by`, `created_at`,
                       `calculated_at`, `verified_at`, `approved_at`, `paid_at`
                  FROM `payroll_runs`'
            . ($where !== [] ? ' WHERE ' . implode(' AND ', $where) : '')
            . ' ORDER BY `period_date` DESC, `scheme_code`';
        $this->success($response, $this->db()->fetchAll($sql, $bindings), 'Payroll runs.');
    }

    /** GET /api/hr/payroll/runs/{id} */
    public function show(Request $request, Response $response): never
    {
        $id = (int) $request->param('id');
        $this->attempt($response, 'Payroll run.', function () use ($id) {
            $summary = $this->service()->summary($id);
            $summary['run']['snapshot'] = json_decode((string) $summary['run']['snapshot_json'], true, 512, JSON_THROW_ON_ERROR);
            unset($summary['run']['snapshot_json']);
            return $summary;
        });
    }

    /** GET /api/hr/payroll/runs/{id}/lines */
    public function lines(Request $request, Response $response): never
    {
        $id = (int) $request->param('id');
        $this->attempt($response, 'Payroll lines.', function () use ($id) {
            return array_map(static function (array $line): array {
                $line['inputs'] = json_decode((string) $line['inputs_json'], true, 512, JSON_THROW_ON_ERROR);
                $line['warnings'] = json_decode((string) ($line['warnings_json'] ?? '[]'), true, 512, JSON_THROW_ON_ERROR);
                unset($line['inputs_json'], $line['warnings_json']);
                return $line;
            }, $this->service()->lines($id));
        });
    }

    /** GET /api/hr/payroll/runs/{id}/audit — who changed what, and every adjustment with its reason. */
    public function audit(Request $request, Response $response): never
    {
        $id = (string) $request->param('id');
        $db = $this->db();
        $this->success($response, [
            'audit' => $db->fetchAll(
                'SELECT `id`, `actor_user_id`, `action`, `before_json`, `after_json`, `created_at`
                   FROM `payroll_audit_log` WHERE `entity_type` = ? AND `entity_id` = ? ORDER BY `id`',
                ['payroll_run', $id]
            ),
            'adjustments' => $db->fetchAll(
                'SELECT `id`, `line_id`, `component`, `old_value`, `new_value`, `reason`, `created_by`, `created_at`
                   FROM `payroll_adjustments` WHERE `run_id` = ? ORDER BY `id`',
                [(int) $id]
            ),
        ], 'Payroll run history.');
    }

    /** POST /api/hr/payroll/runs  {scheme_code, period_date, title} */
    public function create(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $body = $request->body();
        $this->attempt($response, 'Payroll run created.', function () use ($body, $actor) {
            $id = $this->service()->createRun(
                (string) ($body['scheme_code'] ?? ''),
                (string) ($body['period_date'] ?? ''),
                trim((string) ($body['title'] ?? '')) ?: 'Payroll run',
                $actor,
            );
            return ['id' => $id];
        });
    }

    /** POST /api/hr/payroll/runs/{id}/generate */
    public function generate(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $id = (int) $request->param('id');
        $this->attempt($response, 'Lines generated from contracts.', function () use ($id, $actor) {
            return ['lines_added' => $this->service()->generateFromContracts($id, $actor)];
        });
    }

    /** POST /api/hr/payroll/runs/{id}/lines  {employee_id, line_ref, inputs, reason} */
    public function addLine(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $id = (int) $request->param('id');
        $body = $request->body();
        $this->attempt($response, 'Line added.', function () use ($id, $body, $actor) {
            return ['line_id' => $this->service()->addLine(
                $id,
                (int) ($body['employee_id'] ?? 0),
                (string) ($body['line_ref'] ?? ''),
                (array) ($body['inputs'] ?? []),
                $actor,
                (string) ($body['reason'] ?? ''),
            )];
        });
    }

    /** POST /api/hr/payroll/runs/{id}/lines/{lineId}  {changes, reason} */
    public function updateLine(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $id = (int) $request->param('id');
        $lineId = (int) $request->param('lineId');
        $body = $request->body();
        $this->attempt($response, 'Line updated. Recalculate the run to refresh the figures.', function () use ($id, $lineId, $body, $actor) {
            $this->service()->updateLine($id, $lineId, (array) ($body['changes'] ?? []), $actor, (string) ($body['reason'] ?? ''));
            return null;
        });
    }

    /** POST /api/hr/payroll/runs/{id}/lines/{lineId}/remove  {reason} */
    public function removeLine(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $id = (int) $request->param('id');
        $lineId = (int) $request->param('lineId');
        $body = $request->body();
        $this->attempt($response, 'Line removed.', function () use ($id, $lineId, $body, $actor) {
            $this->service()->removeLine($id, $lineId, $actor, (string) ($body['reason'] ?? ''));
            return null;
        });
    }

    /** POST /api/hr/payroll/runs/{id}/calculate */
    public function calculate(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $id = (int) $request->param('id');
        $this->attempt($response, 'Run calculated.', function () use ($id, $actor) {
            $this->service()->calculate($id, $actor);
            return null;
        });
    }

    /** POST /api/hr/payroll/runs/{id}/verify */
    public function verify(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $id = (int) $request->param('id');
        $this->attempt($response, 'Run verified.', function () use ($id, $actor) {
            $this->service()->verify($id, $actor);
            return null;
        });
    }

    /** POST /api/hr/payroll/runs/{id}/return  {reason} */
    public function returnToPreparer(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $id = (int) $request->param('id');
        $body = $request->body();
        $this->attempt($response, 'Run sent back to the preparer.', function () use ($id, $actor, $body) {
            $this->service()->returnToPreparer($id, $actor, (string) ($body['reason'] ?? ''));
            return null;
        });
    }

    /** POST /api/hr/payroll/runs/{id}/approve */
    public function approve(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $id = (int) $request->param('id');
        $this->attempt($response, 'Run approved and locked.', function () use ($id, $actor) {
            $this->service()->approve($id, $actor);
            return null;
        });
    }

    /** POST /api/hr/payroll/runs/{id}/pay */
    public function pay(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $id = (int) $request->param('id');
        $this->attempt($response, 'Run marked paid.', function () use ($id, $actor) {
            $this->service()->markPaid($id, $actor);
            return null;
        });
    }

    /** POST /api/hr/payroll/runs/{id}/reopen  {reason} */
    public function reopen(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $id = (int) $request->param('id');
        $body = $request->body();
        $this->attempt($response, 'Run reopened for changes.', function () use ($id, $actor, $body) {
            $this->service()->reopen($id, $actor, (string) ($body['reason'] ?? ''));
            return null;
        });
    }

    /**
     * GET /api/hr/payroll/runs/{id}/export.xlsx
     * One workbook: the run sheet in CUR's column order, the bank transfer list, and the statutory totals.
     */
    public function exportWorkbook(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $id = (int) $request->param('id');
        try {
            $service = $this->service();
            $run = $service->run($id);
            $lines = $service->lines($id);
            $book = PayrollWorkbook::build(
                $run,
                PayrollSheet::build($lines, $this->names($lines)),
                BankTransferList::build($lines),
                StatutoryTotals::build($lines),
            );
            $bytes = PayrollWorkbook::toXlsx($book);
        } catch (InvalidArgumentException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $service->recordAccess($actor, 'run.exported', $id, 'workbook');
        $this->sendFile(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'payroll-run-' . $id . '.xlsx',
            $bytes,
        );
    }

    /** GET /api/hr/payroll/runs/{id}/lines/{lineId}/payslip.pdf */
    public function payslip(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $id = (int) $request->param('id');
        $lineId = (int) $request->param('lineId');
        try {
            $service = $this->service();
            $run = $service->run($id);
            $line = $this->db()->fetchOne('SELECT * FROM `payroll_lines` WHERE `id` = ? AND `run_id` = ?', [$lineId, $id]);
            if ($line === false) {
                $this->error($response, 'That line is not on this run.', 404);
            }
            $pdf = PayrollPdf::render(PayslipHtml::build($line, $run));
        } catch (InvalidArgumentException $e) {
            $this->error($response, $e->getMessage(), 422);
        }
        if ($pdf === null) {
            $this->error($response, 'PDF rendering is not available on this server.', 503);
        }

        $service->recordAccess($actor, 'payslip.downloaded', $id, 'line ' . $lineId);
        $this->sendFile('application/pdf', 'payslip-' . $lineId . '.pdf', $pdf);
    }

    /**
     * Names split into first and last, keyed by employee id. The stored line name is "Last First".
     *
     * @param list<array<string, mixed>> $lines
     * @return array<int, array{first_name: string, last_name: string}>
     */
    private function names(array $lines): array
    {
        $ids = array_values(array_unique(array_map(static fn (array $l): int => (int) $l['employee_id'], $lines)));
        if ($ids === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $rows = $this->db()->fetchAll(
            "SELECT `employee_id`, `employee_fname`, `employee_lname` FROM `employees` WHERE `employee_id` IN ({$placeholders})",
            $ids
        );
        $names = [];
        foreach ($rows as $row) {
            $names[(int) $row['employee_id']] = [
                'first_name' => (string) $row['employee_fname'],
                'last_name'  => (string) $row['employee_lname'],
            ];
        }
        return $names;
    }

    private function sendFile(string $contentType, string $filename, string $bytes): never
    {
        header('Content-Type: ' . $contentType);
        header('Content-Disposition: attachment; filename="' . addslashes($filename) . '"');
        header('Content-Length: ' . strlen($bytes));
        header('Cache-Control: no-store');
        echo $bytes;
        exit;
    }
}
