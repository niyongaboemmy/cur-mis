<?php

declare(strict_types=1);

namespace App\Payroll\Staff;

use App\Services\PayrollCalculator;
use Core\Database;
use InvalidArgumentException;

/**
 * Employment contracts: the salary history of each person, per pay scheme.
 *
 * A person has at most one open contract (no end date) per scheme. Changing a salary means ending the
 * current contract on the day before the change and adding a new one, so the history stays complete.
 */
final class ContractService
{
    public const TAX_METHODS = ['PROGRESSIVE', 'FLAT_SECONDARY', 'CASUAL_LABOUR', 'WITHHOLDING', 'NONE'];

    public function __construct(private Database $db)
    {
    }

    /**
     * @param array<string, mixed> $data
     */
    public function add(int $employeeId, array $data, int $actorId): int
    {
        $scheme = (string) ($data['scheme_code'] ?? '');
        if ($this->db->fetchOne('SELECT `code` FROM `pay_schemes` WHERE `code` = ? AND `is_active` = 1', [$scheme]) === false) {
            throw new InvalidArgumentException("Unknown or inactive pay scheme: {$scheme}");
        }
        $start = (string) ($data['start_date'] ?? '');
        $this->assertDate($start, 'Start date');
        $end = isset($data['end_date']) && $data['end_date'] !== '' ? (string) $data['end_date'] : null;
        if ($end !== null) {
            $this->assertDate($end, 'End date');
            if ($end < $start) {
                throw new InvalidArgumentException('The contract ends before it starts.');
            }
        }

        $basic = $data['basic_salary'] ?? null;
        if (!is_numeric($basic) || (float) $basic < 0 || (float) $basic !== round((float) $basic)) {
            throw new InvalidArgumentException('Basic salary must be a whole number of RWF, zero or more.');
        }

        $roles = isset($data['responsibility_roles']) && $data['responsibility_roles'] !== ''
            ? implode(',', PayrollCalculator::parseRoles((string) $data['responsibility_roles']))
            : null;

        $taxMethod = isset($data['tax_method']) && $data['tax_method'] !== '' ? (string) $data['tax_method'] : null;
        if ($taxMethod !== null && !in_array($taxMethod, self::TAX_METHODS, true)) {
            throw new InvalidArgumentException("Unknown tax method {$taxMethod}.");
        }
        $taxReason = trim((string) ($data['tax_method_reason'] ?? ''));
        if ($taxMethod !== null && $taxReason === '') {
            throw new InvalidArgumentException('A reason is required to override the tax method.');
        }

        if ($end === null && $this->hasOpenContract($employeeId, $scheme)) {
            throw new InvalidArgumentException('This person already has an open contract in this scheme. End it first.');
        }

        $this->db->execute(
            'INSERT INTO `employment_contracts`
                (`employee_id`, `scheme_code`, `start_date`, `end_date`, `basic_salary`, `topup_rate`, `housing_divisor`,
                 `transport_divisor`, `responsibility_roles`, `tax_method`, `tax_method_reason`, `status`, `created_by`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $employeeId,
                $scheme,
                $start,
                $end,
                (int) $basic,
                $this->nullableString($data['topup_rate'] ?? null),
                $this->nullableInt($data['housing_divisor'] ?? null),
                $this->nullableInt($data['transport_divisor'] ?? null),
                $roles,
                $taxMethod,
                $taxMethod !== null ? $taxReason : null,
                $end !== null && $end < date('Y-m-d') ? 'Ended' : 'Active',
                $actorId,
            ]
        );
        $id = (int) $this->db->lastInsertId();
        $this->audit($actorId, 'contract.added', $id, ['employee_id' => $employeeId, 'scheme' => $scheme, 'basic' => (int) $basic]);
        return $id;
    }

    /** Ends a contract on a date. The end date must not be before its start. */
    public function end(int $contractId, string $endDate, int $actorId): void
    {
        $this->assertDate($endDate, 'End date');
        $contract = $this->db->fetchOne('SELECT * FROM `employment_contracts` WHERE `id` = ?', [$contractId]);
        if ($contract === false) {
            throw new InvalidArgumentException("Contract {$contractId} not found.");
        }
        if ($endDate < (string) $contract['start_date']) {
            throw new InvalidArgumentException('The end date is before the contract starts.');
        }
        $this->db->execute(
            'UPDATE `employment_contracts` SET `end_date` = ?, `status` = ? WHERE `id` = ?',
            [$endDate, 'Ended', $contractId]
        );
        $this->audit($actorId, 'contract.ended', $contractId, ['end_date' => $endDate]);
    }

    /** @return list<array<string, mixed>> */
    public function forEmployee(int $employeeId): array
    {
        return $this->db->fetchAll(
            'SELECT * FROM `employment_contracts` WHERE `employee_id` = ? ORDER BY `start_date` DESC, `id` DESC',
            [$employeeId]
        );
    }

    private function hasOpenContract(int $employeeId, string $scheme): bool
    {
        return $this->db->fetchOne(
            'SELECT `id` FROM `employment_contracts` WHERE `employee_id` = ? AND `scheme_code` = ? AND `end_date` IS NULL',
            [$employeeId, $scheme]
        ) !== false;
    }

    private function assertDate(string $date, string $label): void
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !checkdate((int) substr($date, 5, 2), (int) substr($date, 8, 2), (int) substr($date, 0, 4))) {
            throw new InvalidArgumentException("{$label} must be a real date as YYYY-MM-DD.");
        }
    }

    private function nullableString(mixed $value): ?string
    {
        return $value === null || $value === '' ? null : (string) $value;
    }

    private function nullableInt(mixed $value): ?int
    {
        return $value === null || $value === '' ? null : (int) $value;
    }

    private function audit(int $actorId, string $action, int $contractId, array $after): void
    {
        $this->db->execute(
            'INSERT INTO `payroll_audit_log` (`actor_user_id`, `action`, `entity_type`, `entity_id`, `after_json`)
             VALUES (?, ?, ?, ?, ?)',
            [$actorId, $action, 'employment_contract', (string) $contractId, json_encode($after, JSON_THROW_ON_ERROR)]
        );
    }
}
