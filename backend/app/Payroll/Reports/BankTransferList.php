<?php

declare(strict_types=1);

namespace App\Payroll\Reports;

/**
 * The bank transfer list: one line per person per bank account, grouped by bank.
 * A person with several module lines on the same run is paid once, with their nets added together.
 */
final class BankTransferList
{
    public const UNASSIGNED = 'Bank not recorded';

    /**
     * @param list<array<string, mixed>> $lines payroll_lines rows
     * @return array{banks: list<array{bank: string, payments: list<array{name: string, account: string, amount: int}>, total: int}>, total: int}
     */
    public static function build(array $lines): array
    {
        $byBank = [];
        foreach ($lines as $line) {
            $bank = trim((string) ($line['bank_name'] ?? '')) ?: self::UNASSIGNED;
            $key = (int) $line['employee_id'];
            $byBank[$bank][$key] ??= [
                'name'    => (string) $line['employee_name'],
                'account' => (string) ($line['account_number'] ?? ''),
                'amount'  => 0,
            ];
            $byBank[$bank][$key]['amount'] += (int) $line['net_pay'];
        }

        ksort($byBank);
        $banks = [];
        $grand = 0;
        foreach ($byBank as $bank => $people) {
            $payments = array_values($people);
            usort($payments, static fn (array $a, array $b): int => strcasecmp($a['name'], $b['name']));
            $total = array_sum(array_column($payments, 'amount'));
            $grand += $total;
            $banks[] = ['bank' => (string) $bank, 'payments' => $payments, 'total' => $total];
        }

        return ['banks' => $banks, 'total' => $grand];
    }
}
