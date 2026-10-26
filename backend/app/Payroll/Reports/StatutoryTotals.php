<?php

declare(strict_types=1);

namespace App\Payroll\Reports;

/**
 * Totals owed to each statutory body, for the period of the lines given (one run, or several runs in a month).
 * Employee and employer shares are kept apart.
 */
final class StatutoryTotals
{
    /**
     * @param list<array<string, mixed>> $lines payroll_lines rows, possibly from several runs
     * @return array{
     *     rra: array{employee: int},
     *     rssb: array{pension: array{employee: int, employer: int}, maternity: array{employee: int, employer: int},
     *                 hazard: array{employer: int}, total: array{employee: int, employer: int}},
     *     rama: array{employee: int, employer: int},
     *     cbhi: array{employee: int}
     * }
     */
    public static function build(array $lines): array
    {
        $sum = static fn (string $column): int => array_sum(array_map(static fn (array $l): int => (int) $l[$column], $lines));

        $pensionEe = $sum('pension_employee');
        $pensionEr = $sum('pension_employer');
        $maternityEe = $sum('maternity_employee');
        $maternityEr = $sum('maternity_employer');
        $hazardEr = $sum('hazard_employer');

        return [
            'rra'  => ['employee' => $sum('paye')],
            'rssb' => [
                'pension'   => ['employee' => $pensionEe, 'employer' => $pensionEr],
                'maternity' => ['employee' => $maternityEe, 'employer' => $maternityEr],
                'hazard'    => ['employer' => $hazardEr],
                'total'     => [
                    'employee' => $pensionEe + $maternityEe,
                    'employer' => $pensionEr + $maternityEr + $hazardEr,
                ],
            ],
            'rama' => ['employee' => $sum('rama_employee'), 'employer' => $sum('rama_employer')],
            'cbhi' => ['employee' => $sum('cbhi')],
        ];
    }
}
