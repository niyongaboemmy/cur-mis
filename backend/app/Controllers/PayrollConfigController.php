<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\HrPayrollModel;
use App\Services\AutoDeductionService;
use App\Services\HrPayrollRecalculator;
use App\Services\PayrollSettings;

class PayrollConfigController extends BaseController
{
    private const DEDUCTION_COLUMNS = "id, label, description, category, employee_rate, employer_rate, base, scope, is_active, sort_order";

    private function db()
    {
        return (new HrPayrollModel())->db();
    }

    /** Ensure the hr_custom_deductions and hr_custom_deduction_staff tables exist (idempotent). */
    private function ensureTable(): void
    {
        $this->db()->execute("
            CREATE TABLE IF NOT EXISTS `hr_custom_deductions` (
                `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `label`         VARCHAR(100) NOT NULL,
                `description`   VARCHAR(255) DEFAULT NULL,
                `category`      VARCHAR(20)  NOT NULL DEFAULT 'Other',
                `employee_rate` DECIMAL(6,3) NOT NULL DEFAULT 0,
                `employer_rate` DECIMAL(6,3) NOT NULL DEFAULT 0,
                `base`          VARCHAR(10)  NOT NULL DEFAULT 'gross',
                `scope`         VARCHAR(12)  NOT NULL DEFAULT 'all',
                `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
                `sort_order`    INT NOT NULL DEFAULT 0,
                `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
        $this->db()->execute("
            CREATE TABLE IF NOT EXISTS `hr_custom_deduction_staff` (
                `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `deduction_id` INT UNSIGNED NOT NULL,
                `emp_id`       INT NOT NULL,
                `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uniq_ded_staff` (`deduction_id`, `emp_id`),
                KEY `idx_ded_staff_emp` (`emp_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
    }

    /**
     * GET /api/hr/config
     * Returns every payroll setting (rates, PAYE bands, responsibility amounts; defaults
     * for any not yet stored) plus the automatic deduction items.
     */
    public function index(Request $request, Response $response): never
    {
        $map = PayrollSettings::load($this->db());
        $map['custom_deductions'] = $this->listDeductionRows();

        $this->success($response, $map, 'Payroll config fetched.');
    }

    /**
     * PUT /api/hr/config
     * Saves payroll settings. Only known setting keys are accepted; the values are
     * checked as a whole so the PAYE bands stay in order.
     */
    public function update(Request $request, Response $response): never
    {
        $data    = $request->body();
        $db      = $this->db();
        $allowed = array_flip(PayrollSettings::keys());

        $changes = [];
        $errors  = [];
        foreach ($data as $key => $value) {
            if (!is_string($key) || !isset($allowed[trim($key)])) {
                continue;
            }
            if (!is_numeric($value)) {
                $errors[trim($key)] = 'Must be a number.';
                continue;
            }
            $changes[trim($key)] = (float)$value;
        }

        // Check the saved values together with the ones being changed.
        $merged = array_merge(PayrollSettings::load($db), $changes);
        $errors = array_merge($errors, PayrollSettings::validate($merged));
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        foreach ($changes as $key => $value) {
            $db->execute(
                "INSERT INTO payroll_config (config_key, config_value) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)",
                [$key, (string)$value]
            );
        }

        $updated = count($changes);
        $this->success($response, ['updated' => $updated], "Updated {$updated} config entries.");
    }

    /**
     * GET /api/hr/config/deductions
     * List automatic deduction items.
     */
    public function listDeductions(Request $request, Response $response): never
    {
        $this->success($response, $this->listDeductionRows(), 'Custom deductions fetched.');
    }

    /**
     * POST /api/hr/config/deductions
     * Add an automatic deduction item for all staff or for selected staff.
     */
    public function addDeduction(Request $request, Response $response): never
    {
        $this->ensureTable();
        $db   = $this->db();
        $data = $this->validatedDeduction($request->body(), $response);

        $db->execute(
            "INSERT INTO hr_custom_deductions
                (label, description, category, employee_rate, employer_rate, base, scope, is_active, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)",
            [
                $data['label'], $data['description'], $data['category'],
                $data['employee_rate'], $data['employer_rate'], $data['base'], $data['scope'],
            ]
        );
        $id = (int) $db->lastInsertId();

        AutoDeductionService::syncStaff($db, $id, $data['employee_ids']);
        $this->refreshPayroll($data['scope'] === AutoDeductionService::SCOPE_ALL ? null : $data['employee_ids']);

        $this->success($response, $this->deductionRow($id), 'Custom deduction added.', 201);
    }

    /**
     * PUT /api/hr/config/deductions/:id
     * Update an automatic deduction item. Pending payroll rows for the affected staff are recalculated.
     */
    public function updateDeduction(Request $request, Response $response): never
    {
        $this->ensureTable();
        $db   = $this->db();
        $id   = (int)$request->param('id');
        $data = $request->body();

        $before = $db->fetchOne("SELECT id, scope FROM hr_custom_deductions WHERE id = ?", [$id]);
        if (!$before) {
            $this->error($response, 'Deduction not found.', 404);
        }

        // Staff whose payslips may change: everyone, if the item applied to all before or applies to all now.
        $oldStaff = $before['scope'] === AutoDeductionService::SCOPE_ALL
            ? null
            : AutoDeductionService::staffIds($db, $id);

        // A save that leaves out employee_ids (for example, an on/off toggle) keeps the current staff.
        if (!array_key_exists('employee_ids', $data)) {
            $data['employee_ids'] = AutoDeductionService::staffIds($db, $id);
        }
        $values   = $this->validatedDeduction($data, $response);
        $isActive = (int)(bool)($data['is_active'] ?? 1);

        $db->execute(
            "UPDATE hr_custom_deductions
             SET label = ?, description = ?, category = ?, employee_rate = ?, employer_rate = ?,
                 base = ?, scope = ?, is_active = ?
             WHERE id = ?",
            [
                $values['label'], $values['description'], $values['category'],
                $values['employee_rate'], $values['employer_rate'], $values['base'], $values['scope'],
                $isActive, $id,
            ]
        );
        AutoDeductionService::syncStaff($db, $id, $values['scope'] === AutoDeductionService::SCOPE_ALL ? [] : $values['employee_ids']);

        $affected = ($oldStaff === null || $values['scope'] === AutoDeductionService::SCOPE_ALL)
            ? null
            : array_values(array_unique([...$oldStaff, ...$values['employee_ids']]));
        $this->refreshPayroll($affected);

        $this->success($response, $this->deductionRow($id), 'Custom deduction updated.');
    }

    /**
     * DELETE /api/hr/config/deductions/:id
     * Remove an automatic deduction item and recalculate pending payroll for the staff it applied to.
     */
    public function deleteDeduction(Request $request, Response $response): never
    {
        $this->ensureTable();
        $db = $this->db();
        $id = (int)$request->param('id');

        $before = $db->fetchOne("SELECT id, scope FROM hr_custom_deductions WHERE id = ?", [$id]);
        if (!$before) {
            $this->error($response, 'Deduction not found.', 404);
        }
        $affected = $before['scope'] === AutoDeductionService::SCOPE_ALL
            ? null
            : AutoDeductionService::staffIds($db, $id);

        $db->execute("DELETE FROM hr_custom_deduction_staff WHERE deduction_id = ?", [$id]);
        $db->execute("DELETE FROM hr_custom_deductions WHERE id = ?", [$id]);
        $this->refreshPayroll($affected);

        $this->success($response, null, 'Custom deduction deleted.');
    }

    /** Every deduction item with its scope and assigned staff, in Payroll Settings order. */
    private function listDeductionRows(): array
    {
        $this->ensureTable();
        $db   = $this->db();
        $rows = $db->fetchAll(
            "SELECT " . self::DEDUCTION_COLUMNS . " FROM hr_custom_deductions ORDER BY sort_order ASC, id ASC"
        ) ?: [];

        $staff = [];
        foreach ($db->fetchAll("SELECT deduction_id, emp_id FROM hr_custom_deduction_staff ORDER BY emp_id") ?: [] as $link) {
            $staff[(int)$link['deduction_id']][] = (int)$link['emp_id'];
        }

        return array_map(fn (array $row) => $this->present($row, $staff[(int)$row['id']] ?? []), $rows);
    }

    /** One deduction item with its staff, for the response after a save. */
    private function deductionRow(int $id): ?array
    {
        $row = $this->db()->fetchOne("SELECT " . self::DEDUCTION_COLUMNS . " FROM hr_custom_deductions WHERE id = ?", [$id]);
        return $row ? $this->present($row, AutoDeductionService::staffIds($this->db(), $id)) : null;
    }

    /** Shapes a database row for the API. */
    private function present(array $row, array $employeeIds): array
    {
        $row['id']            = (int) $row['id'];
        $row['is_active']     = (int) $row['is_active'];
        $row['sort_order']    = (int) $row['sort_order'];
        $row['employee_rate'] = (float) $row['employee_rate'];
        $row['employer_rate'] = (float) $row['employer_rate'];
        $row['employee_ids']  = $employeeIds;
        return $row;
    }

    /**
     * Checks a deduction item from the request and returns the values to store.
     * Responds with 422 when a value is not valid.
     *
     * @return array{label: string, description: string, category: string, employee_rate: float,
     *               employer_rate: float, base: string, scope: string, employee_ids: list<int>}
     */
    private function validatedDeduction(array $data, Response $response): array
    {
        $errors = [];

        $label = trim((string)($data['label'] ?? ''));
        if ($label === '') {
            $errors['label'] = 'Label is required.';
        } elseif (mb_strlen($label) > 100) {
            $errors['label'] = 'Label must be 100 characters or fewer.';
        }

        foreach (['employee_rate', 'employer_rate'] as $field) {
            $value = $data[$field] ?? 0;
            if (!is_numeric($value) || (float)$value < 0 || (float)$value > 100) {
                $errors[$field] = 'Must be a percentage from 0 to 100.';
            }
        }

        $category = (string)($data['category'] ?? 'Other');
        if (!in_array($category, AutoDeductionService::CATEGORIES, true)) {
            $errors['category'] = 'Category must be Insurance or Other.';
        }

        $base = strtolower(trim((string)($data['base'] ?? AutoDeductionService::BASE_GROSS)));
        if (!in_array($base, [AutoDeductionService::BASE_GROSS, AutoDeductionService::BASE_NET], true)) {
            $errors['base'] = 'Base must be gross or net.';
        }

        $scope = (string)($data['scope'] ?? AutoDeductionService::SCOPE_ALL);
        if (!in_array($scope, [AutoDeductionService::SCOPE_ALL, AutoDeductionService::SCOPE_INDIVIDUAL], true)) {
            $errors['scope'] = 'Scope must be all or individual.';
        }

        $employeeIds = [];
        if ($scope === AutoDeductionService::SCOPE_INDIVIDUAL) {
            $requested = array_values(array_unique(array_map('intval', (array)($data['employee_ids'] ?? []))));
            $requested = array_filter($requested, static fn (int $id) => $id > 0);
            if (empty($requested)) {
                $errors['employee_ids'] = 'Select at least one staff member, or choose all staff.';
            } else {
                $placeholders = implode(',', array_fill(0, count($requested), '?'));
                $found = $this->db()->fetchAll(
                    "SELECT id FROM employees WHERE id IN ({$placeholders})",
                    array_values($requested)
                ) ?: [];
                if (count($found) !== count($requested)) {
                    $errors['employee_ids'] = 'One or more selected staff members do not exist.';
                }
                $employeeIds = array_values($requested);
            }
        }

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        return [
            'label'         => $label,
            'description'   => trim((string)($data['description'] ?? '')),
            'category'      => $category,
            'employee_rate' => (float)($data['employee_rate'] ?? 0),
            'employer_rate' => (float)($data['employer_rate'] ?? 0),
            'base'          => $base,
            'scope'         => $scope,
            'employee_ids'  => $employeeIds,
        ];
    }

    /**
     * Recalculates pending payroll rows so a changed deduction shows on them straight away.
     * Approved and Paid rows are never changed.
     *
     * @param list<int>|null $empIds Employees to refresh, or null for every employee with a pending row
     */
    private function refreshPayroll(?array $empIds): void
    {
        $db  = $this->db();
        $ids = $empIds ?? array_column(
            $db->fetchAll("SELECT DISTINCT emp_id FROM hr_payroll WHERE status = 'Pending'") ?: [],
            'emp_id'
        );
        foreach (array_unique(array_map('intval', $ids)) as $empId) {
            HrPayrollRecalculator::refreshPendingForEmployee($db, $empId);
        }
    }
}
