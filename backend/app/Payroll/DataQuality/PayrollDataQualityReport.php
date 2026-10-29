<?php

declare(strict_types=1);

namespace App\Payroll\DataQuality;

use Core\Database;

/**
 * Builds the HR data-quality report from the employees table. Read-only.
 *
 * Scope: employees with account_status = 'Active'. Terminated and inactive staff are not paid,
 * so their rows are not reported. The query names its columns explicitly and never reads
 * password, OTP or login columns.
 */
final class PayrollDataQualityReport
{
    public function __construct(private Database $db)
    {
    }

    /**
     * @param string|null $salaryReviewAbove decimal string, or null for no review level
     * @return array<string, mixed>
     */
    public function build(?string $salaryReviewAbove = null): array
    {
        $bankNames = array_map(
            static fn (array $row): string => (string) $row['name'],
            $this->db->fetchAll('SELECT `name` FROM `banks` WHERE `is_active` = 1')
        );

        $checker = new EmployeeDataChecker($bankNames, $salaryReviewAbove);

        $employees = $this->db->fetchAll(
            'SELECT `employee_id`, `employee_fname`, `employee_lname`, `employee_status`, `staff_category`,
                    `employee_bank`, `employee_account`, `rssb_number`, `salary`,
                    `insurance_type`, `insurance_premium`, `account_status`
               FROM `employees`
              WHERE `account_status` = ?
              ORDER BY `employee_lname`, `employee_fname`',
            ['Active']
        );

        $issueCounts = [];
        $flagged = [];
        $withErrors = 0;

        foreach ($employees as $employee) {
            $issues = $checker->check($employee);
            if ($issues === []) {
                continue;
            }

            $hasError = false;
            foreach ($issues as $issue) {
                $issueCounts[$issue['code']] = ($issueCounts[$issue['code']] ?? 0) + 1;
                $hasError = $hasError || $issue['severity'] === EmployeeDataChecker::SEVERITY_ERROR;
            }
            $withErrors += $hasError ? 1 : 0;

            $flagged[] = [
                'employee_id' => (int) $employee['employee_id'],
                'name'        => trim($employee['employee_lname'] . ' ' . $employee['employee_fname']),
                'bank'        => (string) ($employee['employee_bank'] ?? ''),
                'account'     => self::maskAccount((string) ($employee['employee_account'] ?? '')),
                'issues'      => $issues,
            ];
        }

        ksort($issueCounts);

        return [
            'scope'            => 'account_status = Active',
            'active_employees' => count($employees),
            'clean_employees'  => count($employees) - count($flagged),
            'blocked_employees' => $withErrors,
            'issue_counts'     => $issueCounts,
            'employees'        => $flagged,
        ];
    }

    /** Shows only the last four characters of an account number. */
    public static function maskAccount(string $account): string
    {
        $account = trim($account);
        if ($account === '') {
            return '';
        }
        return str_repeat('*', max(0, strlen($account) - 4)) . substr($account, -4);
    }
}
