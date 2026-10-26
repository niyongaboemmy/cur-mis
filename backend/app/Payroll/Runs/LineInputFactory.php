<?php

declare(strict_types=1);

namespace App\Payroll\Runs;

use App\Payroll\Engine\LineInput;
use App\Payroll\Money;
use App\Services\PayrollCalculator;
use InvalidArgumentException;

/**
 * Turns the stored inputs of a payroll line into engine inputs, and builds those inputs from
 * contracts, employee records and part-time assignments.
 *
 * The inputs are frozen on the line when it is created, so a later contract change does not
 * silently change a draft. Editing a line updates its inputs and is audited.
 */
final class LineInputFactory
{
    /** Keys a stored input set may carry. Anything else is rejected. */
    public const KEYS = [
        'basic', 'topup_rate', 'housing_divisor', 'transport_divisor', 'responsibility', 'arrears',
        'quantity', 'unit_rate', 'entered_gross', 'target_net', 'tax_method', 'rama', 'other_insurance',
        'deductions', 'contract_id',
    ];

    /**
     * Engine inputs from a stored input set (the inputs_json column).
     *
     * @param array<string, mixed> $inputs
     */
    public static function fromStored(string $scheme, array $inputs): LineInput
    {
        foreach (array_keys($inputs) as $key) {
            if (!in_array($key, self::KEYS, true)) {
                throw new InvalidArgumentException("Unknown payroll input: {$key}");
            }
        }

        return new LineInput(
            scheme: $scheme,
            basic: (int) ($inputs['basic'] ?? 0),
            topupRate: isset($inputs['topup_rate']) ? (string) $inputs['topup_rate'] : null,
            housingDivisor: isset($inputs['housing_divisor']) ? (int) $inputs['housing_divisor'] : null,
            transportDivisor: isset($inputs['transport_divisor']) ? (int) $inputs['transport_divisor'] : null,
            responsibility: (int) ($inputs['responsibility'] ?? 0),
            arrears: (int) ($inputs['arrears'] ?? 0),
            quantity: isset($inputs['quantity']) ? (string) $inputs['quantity'] : null,
            unitRate: isset($inputs['unit_rate']) ? (int) $inputs['unit_rate'] : null,
            enteredGross: isset($inputs['entered_gross']) ? (int) $inputs['entered_gross'] : null,
            targetNet: isset($inputs['target_net']) ? (int) $inputs['target_net'] : null,
            taxMethod: isset($inputs['tax_method']) && $inputs['tax_method'] !== '' ? (string) $inputs['tax_method'] : null,
            rama: (bool) ($inputs['rama'] ?? false),
            otherInsurance: (int) ($inputs['other_insurance'] ?? 0),
            deductions: (int) ($inputs['deductions'] ?? 0),
        );
    }

    /**
     * Inputs for a salaried person from their contract and employee record.
     *
     * @param array<string, mixed>  $contract        employment_contracts row
     * @param array<string, mixed>  $employee        employees row (insurance_type, insurance_premium)
     * @param array<string, int>    $roleAmounts     responsibility amounts from the run snapshot
     * @return array<string, mixed>
     */
    public static function salaryInputs(array $contract, array $employee, array $roleAmounts): array
    {
        $responsibility = 0;
        foreach (PayrollCalculator::parseRoles((string) ($contract['responsibility_roles'] ?? '')) as $code) {
            if (!array_key_exists($code, $roleAmounts)) {
                throw new InvalidArgumentException("No amount in this run for responsibility role {$code}.");
            }
            $responsibility += (int) $roleAmounts[$code];
        }

        return array_merge(
            ['basic' => Money::round((string) $contract['basic_salary'])],
            self::contractOverrides($contract),
            ['responsibility' => $responsibility, 'contract_id' => (int) $contract['id']],
            self::insuranceInputs($employee),
        );
    }

    /**
     * Inputs for a part-time module line: hours × the grade's hourly rate.
     *
     * @param array<string, mixed> $assignment pt_assignments row
     * @param array<string, int>   $hourlyRates grade code => RWF per hour from the run snapshot
     * @return array<string, mixed>
     */
    public static function partTimeInputs(array $assignment, array $hourlyRates): array
    {
        $grade = (string) $assignment['grade_code'];
        if (!array_key_exists($grade, $hourlyRates)) {
            throw new InvalidArgumentException("No hourly rate in this run for grade {$grade}.");
        }
        $hours = $assignment['hours_paid'] !== null && $assignment['hours_paid'] !== ''
            ? (string) $assignment['hours_paid']
            : (string) $assignment['hours_default'];

        return [
            'quantity'   => $hours,
            'unit_rate'  => (int) $hourlyRates[$grade],
            'tax_method' => 'FLAT_SECONDARY',
        ];
    }

    /**
     * The contract fields that override settings defaults. A NULL field means "use the default".
     *
     * @param array<string, mixed> $contract
     * @return array<string, mixed>
     */
    public static function contractOverrides(array $contract): array
    {
        $overrides = [];
        if (($contract['topup_rate'] ?? null) !== null && $contract['topup_rate'] !== '') {
            $overrides['topup_rate'] = (string) $contract['topup_rate'];
        }
        if (($contract['housing_divisor'] ?? null) !== null && $contract['housing_divisor'] !== '') {
            $overrides['housing_divisor'] = (int) $contract['housing_divisor'];
        }
        if (($contract['transport_divisor'] ?? null) !== null && $contract['transport_divisor'] !== '') {
            $overrides['transport_divisor'] = (int) $contract['transport_divisor'];
        }
        if (($contract['tax_method'] ?? null) !== null && $contract['tax_method'] !== '') {
            $overrides['tax_method'] = (string) $contract['tax_method'];
        }
        return $overrides;
    }

    /**
     * RAMA is taken when the employee is on RAMA. An employee on another insurer pays that premium instead.
     *
     * @param array<string, mixed> $employee
     * @return array{rama: bool, other_insurance: int}
     */
    public static function insuranceInputs(array $employee): array
    {
        $type = strtoupper(trim((string) ($employee['insurance_type'] ?? '')));
        if ($type === 'OTHER') {
            return ['rama' => false, 'other_insurance' => Money::round((string) ($employee['insurance_premium'] ?? '0'))];
        }
        return ['rama' => $type === 'RAMA', 'other_insurance' => 0];
    }
}
