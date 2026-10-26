<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Payroll\DataQuality\PayrollDataQualityReport;
use Core\Database;
use Core\Request;
use Core\Response;

/**
 * Read-only payroll reference data and the HR data-quality report.
 * Both need VIEW_PAYROLL (see routes/api/payroll-reference.php).
 */
class PayrollReferenceController extends BaseController
{
    /**
     * GET /api/hr/payroll/data-quality?salary_review_above=10000000
     */
    public function dataQuality(Request $request, Response $response): never
    {
        $threshold = $request->query('salary_review_above');
        if ($threshold !== null && $threshold !== '') {
            if (!preg_match('/^\d+(\.\d+)?$/', (string) $threshold)) {
                $this->error($response, 'salary_review_above must be a positive amount.', 422);
            }
            $threshold = (string) $threshold;
        } else {
            $threshold = null;
        }

        $report = (new PayrollDataQualityReport(Database::getInstance()))->build($threshold);
        $this->success($response, $report, 'Payroll data-quality report.');
    }

    /**
     * GET /api/hr/payroll/reference
     * Pay schemes, every settings version, responsibility roles, hourly rates and banks.
     */
    public function reference(Request $request, Response $response): never
    {
        $db = Database::getInstance();

        $settings = array_map(static function (array $row): array {
            $row['settings'] = json_decode((string) $row['settings_json'], true) ?? [];
            unset($row['settings_json']);
            return $row;
        }, $db->fetchAll('SELECT `id`, `effective_from`, `note`, `created_at`, `settings_json`
                            FROM `payroll_settings` ORDER BY `effective_from` DESC'));

        $this->success($response, [
            'pay_schemes'         => $db->fetchAll('SELECT * FROM `pay_schemes` ORDER BY `sort_order`, `code`'),
            'settings_versions'   => $settings,
            'responsibility_roles' => $db->fetchAll('SELECT * FROM `responsibility_roles` ORDER BY `role_code`, `effective_from` DESC'),
            'hourly_rates'        => $db->fetchAll('SELECT * FROM `hourly_rates` ORDER BY `grade_code`, `effective_from` DESC'),
            'banks'               => $db->fetchAll('SELECT * FROM `banks` WHERE `is_active` = 1 ORDER BY `name`'),
        ], 'Payroll reference data.');
    }
}
