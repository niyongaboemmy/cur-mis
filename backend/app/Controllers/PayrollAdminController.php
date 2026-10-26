<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Payroll\Settings\SettingsAdmin;
use App\Payroll\Staff\ContractService;
use Core\Database;
use Core\Request;
use Core\Response;
use InvalidArgumentException;

/**
 * Employment contracts, and the dated changes to rates, responsibility amounts and hourly rates.
 * Contracts need MANAGE_PAYROLL. Rate and amount changes need APPROVE_PAYROLL (see routes/api/payroll-runs.php).
 */
class PayrollAdminController extends BaseController
{
    private function db(): Database
    {
        return Database::getInstance();
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
        } catch (InvalidArgumentException $e) {
            $this->error($response, $e->getMessage(), 422);
        }
        $this->success($response, $result ?? null, $message);
    }

    /** GET /api/hr/payroll/employees/{id}/contracts */
    public function contracts(Request $request, Response $response): never
    {
        $employeeId = (int) $request->param('id');
        $this->attempt($response, 'Contract history.', fn () => (new ContractService($this->db()))->forEmployee($employeeId));
    }

    /** POST /api/hr/payroll/employees/{id}/contracts */
    public function addContract(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $employeeId = (int) $request->param('id');
        $body = $request->body();
        $this->attempt($response, 'Contract added.', function () use ($employeeId, $body, $actor) {
            return ['id' => (new ContractService($this->db()))->add($employeeId, $body, $actor)];
        });
    }

    /** POST /api/hr/payroll/contracts/{id}/end  {end_date} */
    public function endContract(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $id = (int) $request->param('id');
        $endDate = (string) ($request->body()['end_date'] ?? '');
        $this->attempt($response, 'Contract ended.', function () use ($id, $endDate, $actor) {
            (new ContractService($this->db()))->end($id, $endDate, $actor);
            return null;
        });
    }

    /** POST /api/hr/payroll/settings  {effective_from, settings, note} */
    public function addSettings(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $body = $request->body();
        $settings = $body['settings'] ?? null;
        if (!is_array($settings)) {
            $this->error($response, 'The settings version must be an object.', 422);
        }
        $this->attempt($response, 'Settings version added. It applies to runs for periods from its date.', function () use ($body, $settings, $actor) {
            return ['id' => (new SettingsAdmin($this->db()))->addSettingsVersion(
                (string) ($body['effective_from'] ?? ''),
                $settings,
                trim((string) ($body['note'] ?? '')),
                $actor,
            )];
        });
    }

    /** POST /api/hr/payroll/roles  {role_code, role_name, amount, effective_from} */
    public function addRole(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $body = $request->body();
        $this->attempt($response, 'Responsibility amount added.', function () use ($body, $actor) {
            (new SettingsAdmin($this->db()))->addResponsibilityAmount(
                (string) ($body['role_code'] ?? ''),
                (string) ($body['role_name'] ?? ''),
                (int) ($body['amount'] ?? -1),
                (string) ($body['effective_from'] ?? ''),
                $actor,
            );
            return null;
        });
    }

    /** POST /api/hr/payroll/hourly  {grade_code, grade_name, rate, effective_from} */
    public function addHourly(Request $request, Response $response): never
    {
        $actor = $this->actor($request, $response);
        $body = $request->body();
        $this->attempt($response, 'Hourly rate added.', function () use ($body, $actor) {
            (new SettingsAdmin($this->db()))->addHourlyRate(
                (string) ($body['grade_code'] ?? ''),
                (string) ($body['grade_name'] ?? ''),
                (int) ($body['rate'] ?? 0),
                (string) ($body['effective_from'] ?? ''),
                $actor,
            );
            return null;
        });
    }
}
