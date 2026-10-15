<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Automatic deductions set on the Payroll Settings page (Additional Deductions):
 * RADIANT or another insurer, or any other deduction.
 *
 * An item is either a fixed amount in RWF (type 'fixed', taken from net pay) or a
 * percentage (type 'percent', taken from gross or net salary). New items are fixed;
 * percentage items saved before that stay percentages. Each item applies to all
 * staff or to selected staff. PayrollCalculator does the arithmetic. This class only
 * finds the items that apply to an employee.
 */
final class AutoDeductionService
{
    public const SCOPE_ALL        = 'all';
    public const SCOPE_INDIVIDUAL = 'individual';

    public const TYPE_FIXED   = 'fixed';
    public const TYPE_PERCENT = 'percent';

    public const BASE_GROSS = 'gross';
    public const BASE_NET   = 'net';

    public const CATEGORIES = ['Insurance', 'Other'];

    /**
     * Active items that apply to one employee, in Payroll Settings order.
     * Percentages are 6 = 6%, the same as the settings page. Amounts are in RWF.
     *
     * @return list<array{label: string, type: string, base: string, employee_rate: float, employer_rate: float,
     *                     employee_amount: float, employer_amount: float}>
     */
    public static function forEmployee(Database $db, int $empId): array
    {
        $rows = $db->fetchAll(
            "SELECT d.label, d.amount_type, d.base, d.employee_rate, d.employer_rate, d.employee_amount, d.employer_amount
             FROM hr_custom_deductions d
             WHERE d.is_active = 1
               AND (d.scope = ? OR EXISTS (
                     SELECT 1 FROM hr_custom_deduction_staff s
                     WHERE s.deduction_id = d.id AND s.emp_id = ?))
             ORDER BY d.sort_order ASC, d.id ASC",
            [self::SCOPE_ALL, $empId]
        ) ?: [];

        return array_map(static fn (array $row): array => [
            'label'           => (string) $row['label'],
            'type'            => self::normaliseType((string) $row['amount_type']),
            'base'            => self::normaliseBase((string) $row['base']),
            'employee_rate'   => (float) $row['employee_rate'],
            'employer_rate'   => (float) $row['employer_rate'],
            'employee_amount' => (float) $row['employee_amount'],
            'employer_amount' => (float) $row['employer_amount'],
        ], $rows);
    }

    /**
     * Employee ids assigned to one deduction (empty when its scope is 'all').
     *
     * @return list<int>
     */
    public static function staffIds(Database $db, int $deductionId): array
    {
        $rows = $db->fetchAll(
            "SELECT emp_id FROM hr_custom_deduction_staff WHERE deduction_id = ? ORDER BY emp_id",
            [$deductionId]
        ) ?: [];
        return array_map(static fn (array $row): int => (int) $row['emp_id'], $rows);
    }

    /**
     * Replaces the assigned staff of one deduction with the given employee ids.
     *
     * @param list<int> $empIds
     */
    public static function syncStaff(Database $db, int $deductionId, array $empIds): void
    {
        $db->execute("DELETE FROM hr_custom_deduction_staff WHERE deduction_id = ?", [$deductionId]);
        foreach (array_values(array_unique(array_map('intval', $empIds))) as $empId) {
            $db->execute(
                "INSERT INTO hr_custom_deduction_staff (deduction_id, emp_id) VALUES (?, ?)",
                [$deductionId, $empId]
            );
        }
    }

    /** Anything other than 'net' is treated as gross, so an unknown value never changes the basis silently. */
    public static function normaliseBase(?string $base): string
    {
        return strtolower(trim((string) $base)) === self::BASE_NET ? self::BASE_NET : self::BASE_GROSS;
    }

    /** Anything other than 'fixed' is a percentage, which is how items were stored before fixed amounts. */
    public static function normaliseType(?string $type): string
    {
        return strtolower(trim((string) $type)) === self::TYPE_FIXED ? self::TYPE_FIXED : self::TYPE_PERCENT;
    }
}
