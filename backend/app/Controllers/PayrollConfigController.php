<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\HrPayrollModel;
use App\Services\PayrollSettings;

class PayrollConfigController extends BaseController
{
    private function db()
    {
        return (new HrPayrollModel())->db();
    }

    /** Ensure the hr_custom_deductions table exists (idempotent). */
    private function ensureTable(): void
    {
        $this->db()->execute("
            CREATE TABLE IF NOT EXISTS `hr_custom_deductions` (
                `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `label`         VARCHAR(100) NOT NULL,
                `description`   VARCHAR(255) DEFAULT NULL,
                `employee_rate` DECIMAL(6,3) NOT NULL DEFAULT 0,
                `employer_rate` DECIMAL(6,3) NOT NULL DEFAULT 0,
                `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
                `sort_order`    INT NOT NULL DEFAULT 0,
                `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
    }

    /**
     * GET /api/hr/config
     * Returns every payroll setting (rates, PAYE bands, responsibility amounts; defaults
     * for any not yet stored) plus custom deduction items.
     */
    public function index(Request $request, Response $response): never
    {
        $map = PayrollSettings::load($this->db());

        // Attach custom deductions
        $this->ensureTable();
        $map['custom_deductions'] = $this->db()->fetchAll(
            "SELECT id, label, description, employee_rate, employer_rate, is_active, sort_order
             FROM hr_custom_deductions ORDER BY sort_order ASC, id ASC"
        ) ?: [];

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
     * List custom deduction items.
     */
    public function listDeductions(Request $request, Response $response): never
    {
        $this->ensureTable();
        $rows = $this->db()->fetchAll(
            "SELECT id, label, description, employee_rate, employer_rate, is_active, sort_order
             FROM hr_custom_deductions ORDER BY sort_order ASC, id ASC"
        ) ?: [];
        $this->success($response, $rows, 'Custom deductions fetched.');
    }

    /**
     * POST /api/hr/config/deductions
     * Add a new custom deduction item.
     */
    public function addDeduction(Request $request, Response $response): never
    {
        $this->ensureTable();
        $data  = $request->body();
        $label = trim((string)($data['label'] ?? ''));

        if ($label === '') {
            $this->error($response, 'Label is required.', 422);
        }

        $this->db()->execute(
            "INSERT INTO hr_custom_deductions (label, description, employee_rate, employer_rate, is_active, sort_order)
             VALUES (?, ?, ?, ?, 1, 0)",
            [
                $label,
                trim((string)($data['description'] ?? '')),
                (float)($data['employee_rate'] ?? 0),
                (float)($data['employer_rate'] ?? 0),
            ]
        );

        $id = $this->db()->lastInsertId();
        $row = $this->db()->fetchOne(
            "SELECT id, label, description, employee_rate, employer_rate, is_active, sort_order
             FROM hr_custom_deductions WHERE id = ?", [$id]
        );

        $this->success($response, $row, 'Custom deduction added.', 201);
    }

    /**
     * PUT /api/hr/config/deductions/:id
     * Update a custom deduction item.
     */
    public function updateDeduction(Request $request, Response $response): never
    {
        $this->ensureTable();
        $id   = (int)$request->param('id');
        $data = $request->body();

        $row = $this->db()->fetchOne(
            "SELECT id FROM hr_custom_deductions WHERE id = ?", [$id]
        );
        if (!$row) {
            $this->error($response, 'Deduction not found.', 404);
        }

        $this->db()->execute(
            "UPDATE hr_custom_deductions
             SET label = ?, description = ?, employee_rate = ?, employer_rate = ?, is_active = ?
             WHERE id = ?",
            [
                trim((string)($data['label'] ?? '')),
                trim((string)($data['description'] ?? '')),
                (float)($data['employee_rate'] ?? 0),
                (float)($data['employer_rate'] ?? 0),
                (int)(bool)($data['is_active'] ?? 1),
                $id,
            ]
        );

        $updated = $this->db()->fetchOne(
            "SELECT id, label, description, employee_rate, employer_rate, is_active, sort_order
             FROM hr_custom_deductions WHERE id = ?", [$id]
        );

        $this->success($response, $updated, 'Custom deduction updated.');
    }

    /**
     * DELETE /api/hr/config/deductions/:id
     * Remove a custom deduction item.
     */
    public function deleteDeduction(Request $request, Response $response): never
    {
        $this->ensureTable();
        $id = (int)$request->param('id');
        $this->db()->execute("DELETE FROM hr_custom_deductions WHERE id = ?", [$id]);
        $this->success($response, null, 'Custom deduction deleted.');
    }
}
