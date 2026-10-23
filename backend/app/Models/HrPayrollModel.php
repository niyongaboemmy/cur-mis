<?php

declare(strict_types=1);

namespace App\Models;

class HrPayrollModel extends BaseModel
{
    protected string $table = 'hr_payroll';
    protected array $fillable = [
        'emp_id', 'pay_month', 'period_year', 'period_month',
        'basic_salary', 'housing_allowance', 'transport_allowance', 'other_allowances',
        'base_gross', 'responsibility_allowance', 'arrears',
        'gross', 'pension', 'rama', 'maternity', 'maternity_base', 'cbhi', 'other_deductions', 'tax', 'net', 'status',
        'employer_pension', 'employer_maternity', 'employer_rama', 'employer_occupational', 'gross_cost',
    ];

    public function findByPeriod(int $empId, int $year, int $month): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM {$this->table} WHERE emp_id = ? AND period_year = ? AND period_month = ?",
            [$empId, $year, $month]
        );
    }

    public function getSlips(int $empId, ?int $fromYear = null, ?int $fromMonth = null, ?int $toYear = null, ?int $toMonth = null): array
    {
        $sql    = "SELECT
                     id, emp_id, pay_month, period_year, period_month,
                     basic_salary, housing_allowance, transport_allowance, other_allowances,
                     base_gross, responsibility_allowance, arrears, maternity_base,
                     gross        AS gross_salary,
                     pension      AS pension_employee,
                     maternity    AS maternity_employee,
                     rama         AS rama_employee,
                     tax          AS paye,
                     (pension + rama + maternity) AS rssb,
                     cbhi,
                     COALESCE(other_deductions, 0) AS other_deductions,
                     net          AS net_salary,
                     status       AS payroll_status
                   FROM {$this->table} WHERE emp_id = ?";
        $params = [$empId];

        if ($fromYear !== null && $fromMonth !== null) {
            $sql     .= " AND (period_year > ? OR (period_year = ? AND period_month >= ?))";
            $params[] = $fromYear;
            $params[] = $fromYear;
            $params[] = $fromMonth;
        }

        if ($toYear !== null && $toMonth !== null) {
            $sql     .= " AND (period_year < ? OR (period_year = ? AND period_month <= ?))";
            $params[] = $toYear;
            $params[] = $toYear;
            $params[] = $toMonth;
        }

        $sql .= " ORDER BY period_year ASC, period_month ASC";
        return $this->db->fetchAll($sql, $params);
    }

    public function db(): \Core\Database
    {
        return $this->db;
    }
}
