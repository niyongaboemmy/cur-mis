<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\HrPayrollModel;

class PayrollConfigController extends BaseController
{
    private function db()
    {
        return (new HrPayrollModel())->db();
    }

    /**
     * GET /api/hr/config
     * Returns all payroll_config rows as a flat key → float-value map.
     */
    public function index(Request $request, Response $response): never
    {
        $rows = $this->db()->fetchAll(
            "SELECT config_key, config_value FROM payroll_config ORDER BY id ASC"
        );

        $map = [];
        foreach ($rows as $row) {
            $map[$row['config_key']] = (float)$row['config_value'];
        }

        $this->success($response, $map, 'Payroll config fetched.');
    }

    /**
     * PUT /api/hr/config
     * Bulk-update existing config keys.
     * Body: { "rssb_employee_rate": 6.5, "cbhi_employee_rate": 5.0, ... }
     * Unknown keys are silently ignored (only UPDATE, never INSERT).
     */
    public function update(Request $request, Response $response): never
    {
        $data    = $request->body();
        $db      = $this->db();
        $updated = 0;

        foreach ($data as $key => $value) {
            if (!is_string($key) || trim($key) === '') {
                continue;
            }
            $affected = $db->execute(
                "UPDATE payroll_config SET config_value = ? WHERE config_key = ?",
                [(string)(float)$value, trim($key)]
            );
            if ($affected > 0) {
                $updated++;
            }
        }

        $this->success($response, ['updated' => $updated], "Updated {$updated} config entries.");
    }
}
