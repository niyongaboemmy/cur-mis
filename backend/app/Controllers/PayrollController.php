<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\PayrollService;
use App\Helpers\ResponseHelper;

/**
 * Payroll Controller
 *
 * Handles payroll management, salary structures, and payroll runs
 */
class PayrollController extends BaseController
{
    private PayrollService $payrollService;

    public function __construct()
    {
        parent::__construct();
        $this->payrollService = new PayrollService();
    }

    /**
     * GET /api/hr/payroll/structures
     * Get all salary structures
     *
     * @return void
     */
    public function getStructures(): void
    {
        try {
            $page = max(1, (int) ($_GET['page'] ?? 1));
            $limit = min(100, max(10, (int) ($_GET['limit'] ?? 20)));
            $offset = ($page - 1) * $limit;

            $result = $this->payrollService->getSalaryStructures($limit, $offset);

            ResponseHelper::success($result);

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/payroll/structures/:id
     * Get salary structure details
     *
     * @param int $id
     * @return void
     */
    public function getStructure(int $id): void
    {
        try {
            $structure = $this->payrollService->getSalaryStructure($id);

            if (!$structure) {
                ResponseHelper::error('Salary structure not found', 404);
                return;
            }

            ResponseHelper::success($structure);

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * POST /api/hr/payroll/structures
     * Create or update salary structure
     *
     * @return void
     */
    public function saveStructure(): void
    {
        try {
            $data = json_decode(file_get_contents('php://input'), true);

            if (empty($data['name'])) {
                ResponseHelper::error('Structure name is required', 400);
                return;
            }

            $id = $this->payrollService->saveSalaryStructure($data);

            ResponseHelper::success(['id' => $id], 'Salary structure saved');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/payroll/employee/:userId/salary
     * Get employee's current salary assignment
     *
     * @param int $userId
     * @return void
     */
    public function getEmployeeSalary(int $userId): void
    {
        try {
            $salary = $this->payrollService->getEmployeeSalary($userId);

            if (!$salary) {
                ResponseHelper::error('No salary assignment found for employee', 404);
                return;
            }

            ResponseHelper::success($salary);

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * POST /api/hr/payroll/employee/:userId/salary
     * Assign salary structure to employee
     *
     * @param int $userId
     * @return void
     */
    public function assignEmployeeSalary(int $userId): void
    {
        try {
            $data = json_decode(file_get_contents('php://input'), true);

            if (empty($data['salary_structure_id']) || empty($data['basic_salary'])) {
                ResponseHelper::error('Salary structure ID and basic salary are required', 400);
                return;
            }

            $id = $this->payrollService->assignEmployeeSalary(
                $userId,
                (int) $data['salary_structure_id'],
                (float) $data['basic_salary'],
                $data['effective_date'] ?? null
            );

            ResponseHelper::success(['id' => $id], 'Salary assignment created');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/payroll/runs
     * Get all payroll runs
     *
     * @return void
     */
    public function getPayrollRuns(): void
    {
        try {
            $page = max(1, (int) ($_GET['page'] ?? 1));
            $limit = min(100, max(10, (int) ($_GET['limit'] ?? 20)));
            $offset = ($page - 1) * $limit;

            $result = $this->payrollService->getPayrollRuns($limit, $offset);

            ResponseHelper::success($result);

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/payroll/runs/:id
     * Get payroll run details
     *
     * @param int $id
     * @return void
     */
    public function getPayrollRun(int $id): void
    {
        try {
            $page = max(1, (int) ($_GET['page'] ?? 1));
            $limit = min(200, max(50, (int) ($_GET['limit'] ?? 100)));
            $offset = ($page - 1) * $limit;

            $run = $this->payrollService->getPayrollRunDetails($id, $limit, $offset);

            if (!$run) {
                ResponseHelper::error('Payroll run not found', 404);
                return;
            }

            ResponseHelper::success($run);

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * POST /api/hr/payroll/runs
     * Create a new payroll run
     *
     * @return void
     */
    public function createPayrollRun(): void
    {
        try {
            $data = json_decode(file_get_contents('php://input'), true);

            $required = ['payroll_month', 'start_date', 'end_date'];
            foreach ($required as $field) {
                if (empty($data[$field])) {
                    ResponseHelper::error("{$field} is required", 400);
                    return;
                }
            }

            $userId = $this->user['id'] ?? null;
            $id = $this->payrollService->createPayrollRun(
                $data['payroll_month'],
                $data['start_date'],
                $data['end_date'],
                $userId
            );

            ResponseHelper::success(['id' => $id], 'Payroll run created');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * POST /api/hr/payroll/runs/:id/process
     * Process payroll run (generate payroll for all employees)
     *
     * @param int $id
     * @return void
     */
    public function processPayrollRun(int $id): void
    {
        try {
            $result = $this->payrollService->processPayrollRun($id);

            ResponseHelper::success($result, 'Payroll processed');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/hr/payroll/runs/:id/approve
     * Approve payroll run
     *
     * @param int $id
     * @return void
     */
    public function approvePayrollRun(int $id): void
    {
        try {
            $userId = $this->user['id'] ?? null;

            $this->payrollService->approvePayrollRun($id, $userId);

            ResponseHelper::success(null, 'Payroll run approved');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/hr/payroll/runs/:id/mark-paid
     * Mark payroll run as paid
     *
     * @param int $id
     * @return void
     */
    public function markPayrollPaid(int $id): void
    {
        try {
            $this->payrollService->markPayrollPaid($id);

            ResponseHelper::success(null, 'Payroll marked as paid');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/hr/payroll/component-types
     * Get all salary component types
     *
     * @return void
     */
    public function getComponentTypes(): void
    {
        try {
            $types = $this->payrollService->getSalaryComponentTypes();

            ResponseHelper::success($types);

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }
}
