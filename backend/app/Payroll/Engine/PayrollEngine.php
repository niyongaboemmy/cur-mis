<?php

declare(strict_types=1);

namespace App\Payroll\Engine;

use App\Payroll\GrossUpSolver;
use App\Payroll\Money;
use App\Payroll\Tax\CasualLabourTax;
use App\Payroll\Tax\FlatTax;
use App\Payroll\Tax\NoTax;
use App\Payroll\Tax\ProgressiveTax;
use App\Payroll\Tax\TaxMethod;
use InvalidArgumentException;

/**
 * The single source of truth for payroll arithmetic.
 *
 * Pure: no database, no request data, no output. Every rate, divisor, PAYE band and scheme
 * rule comes from the $settings array passed in (see tests/fixtures/payroll/settings_2026.php
 * for the shape). Each line item is rounded to a whole RWF, half-up, before it is used or summed.
 *
 * compute() returns every figure of one payslip line keyed by name. The same names are stored
 * on payroll_lines in Phase 2.
 */
final class PayrollEngine
{
    /** Earnings modes: how a scheme's gross is produced. */
    public const EARN_SALARY  = 'SALARY';   // basic + top-up + housing + transport (+ responsibility, arrears)
    public const EARN_HOURLY  = 'HOURLY';   // quantity (hours) × unit rate
    public const EARN_DAILY   = 'DAILY';    // quantity (days) × unit rate
    public const EARN_ENTERED = 'ENTERED';  // gross typed in, or solved from a target net

    /** Rate keys that must exist in settings['rates']. */
    private const RATE_KEYS = [
        'pension_ee', 'pension_er', 'hazard_er',
        'maternity_ee', 'maternity_er',
        'rama_ee', 'rama_er',
        'cbhi_ee',
    ];

    private const CBHI_BASES        = ['after_all_insurance', 'after_paye_and_rssb_only'];
    private const STATUTORY_BASES   = ['excludes_transport', 'gross'];
    private const EARNINGS_MODES    = [self::EARN_SALARY, self::EARN_HOURLY, self::EARN_DAILY, self::EARN_ENTERED];
    private const TAX_METHODS       = ['PROGRESSIVE', 'FLAT_SECONDARY', 'CASUAL_LABOUR', 'WITHHOLDING', 'NONE'];

    /** @var array<string, mixed> */
    private array $settings;

    /** @param array<string, mixed> $settings */
    public function __construct(array $settings)
    {
        $this->validateSettings($settings);
        $this->settings = $settings;
    }

    /**
     * Full procedure for one employee line in one period.
     *
     * @return array<string, mixed> Every figure of the payslip line, plus 'warnings' (list of codes)
     *
     * @throws InvalidArgumentException for invalid inputs (negative amounts, unknown scheme, etc.)
     */
    public function compute(LineInput $input): array
    {
        $scheme = $this->scheme($input->scheme);
        $this->validateInput($input, $scheme);

        if ($input->targetNet !== null) {
            if ($scheme['earnings'] !== self::EARN_ENTERED) {
                throw new InvalidArgumentException('Gross-up needs an entered-gross scheme.');
            }
            $solved = (new GrossUpSolver())->largestGrossWithNetAtMost(
                $input->targetNet,
                fn (int $gross): int => $this->lineFor($input, $scheme, $gross)['net_pay'],
            );
            $line = $this->lineFor($input, $scheme, $solved['gross']);
            $line['gross_up_residual'] = $solved['residual'];
            return $line;
        }

        $line = $this->lineFor($input, $scheme, null);
        $line['gross_up_residual'] = 0;
        return $line;
    }

    /**
     * The gross a scheme's earnings mode produces before any entered-gross override.
     * Used for PERMANENT, SUPPORT and the hourly/daily schemes.
     *
     * @param array<string, mixed> $scheme
     * @return array{gross: int, basic: int, topup: int, total_basic: int, housing: int, transport: int,
     *               gross_salary: int, responsibility: int, arrears: int}
     */
    private function earnings(LineInput $input, array $scheme, ?int $enteredGross): array
    {
        $zero = ['basic' => 0, 'topup' => 0, 'total_basic' => 0, 'housing' => 0, 'transport' => 0, 'gross_salary' => 0];
        $arrears = $input->arrears;

        if ($scheme['earnings'] === self::EARN_SALARY) {
            $topupRate = $input->topupRate ?? (string) $this->settings['topup_rate'];
            $basic     = $input->basic;
            $topup     = Money::percent($basic, $topupRate);
            $totalBasic = $basic + $topup;
            $hd = $input->housingDivisor ?? (int) $this->settings['housing_divisor'];
            $td = $input->transportDivisor ?? (int) $this->settings['transport_divisor'];
            $housing   = $hd > 0 ? Money::divide($totalBasic, $hd) : 0;
            $transport = $td > 0 ? Money::divide($totalBasic, $td) : 0;
            $grossSalary = $totalBasic + $housing + $transport;

            return [
                'gross'          => $grossSalary + $input->responsibility + $arrears,
                'basic'          => $basic,
                'topup'          => $topup,
                'total_basic'    => $totalBasic,
                'housing'        => $housing,
                'transport'      => $transport,
                'gross_salary'   => $grossSalary,
                'responsibility' => $input->responsibility,
                'arrears'        => $arrears,
            ];
        }

        $earned = match ($scheme['earnings']) {
            self::EARN_HOURLY  => Money::round(bcmul((string) $input->quantity, (string) $input->unitRate, 12)),
            self::EARN_DAILY   => Money::round(bcmul((string) $input->quantity, (string) $input->unitRate, 12)),
            default            => $enteredGross ?? $input->enteredGross ?? 0,
        };

        return $zero + [
            'gross'          => $earned + $arrears,
            'responsibility' => 0,
            'arrears'        => $arrears,
        ];
    }

    /**
     * One full pass of the procedure with the given entered gross (ignored for SALARY schemes).
     *
     * @param array<string, mixed> $scheme
     * @return array<string, mixed>
     */
    private function lineFor(LineInput $input, array $scheme, ?int $enteredGross): array
    {
        $rates = $this->settings['rates'];
        $e = $this->earnings($input, $scheme, $enteredGross);
        $gross = $e['gross'];
        $transport = $e['transport'];

        // Tax (PAYE) on total gross
        $tax = $this->taxMethodFor($input->taxMethod ?? $scheme['tax_method'])->tax($gross);

        // Statutory base for maternity, occupational hazard and RAMA. Transport is excluded
        // when the statutory base setting says so (CUR practice). Pension always uses total gross.
        $statBase = $this->settings['statutory_base'] === 'excludes_transport' ? $gross - $transport : $gross;

        $pensionEe = $scheme['rssb'] ? Money::percent($gross, $rates['pension_ee']) : 0;
        $pensionEr = $scheme['rssb'] ? Money::percent($gross, $rates['pension_er']) : 0;
        $maternityEe = $scheme['rssb'] ? Money::percent($statBase, $rates['maternity_ee']) : 0;
        $maternityEr = $scheme['rssb'] ? Money::percent($statBase, $rates['maternity_er']) : 0;
        $hazardEr = $scheme['hazard'] ? Money::percent($statBase, $rates['hazard_er']) : 0;
        $rssbEeTotal = $pensionEe + $maternityEe;

        $ramaOn = $input->rama && $scheme['rama'];
        $ramaEe = $ramaOn ? Money::percent($statBase, $rates['rama_ee']) : 0;
        $ramaEr = $ramaOn ? Money::percent($statBase, $rates['rama_er']) : 0;

        $other = $input->otherInsurance;

        // CBHI base: the setting decides whether RAMA and other insurance come off first.
        $netBeforeCbhi = $this->settings['cbhi_base'] === 'after_all_insurance'
            ? $gross - $tax - $rssbEeTotal - $ramaEe - $other
            : $gross - $tax - $rssbEeTotal;

        $cbhi = $scheme['cbhi'] ? Money::percent($netBeforeCbhi, $rates['cbhi_ee']) : 0;
        $netAfterCbhi = $netBeforeCbhi - $cbhi;

        $netPay = $netAfterCbhi - $input->deductions;

        $employerCost = $gross + $pensionEr + $maternityEr + $hazardEr + $ramaEr;

        $totalDeductions = $tax + $rssbEeTotal + $ramaEe + $other + $cbhi + $input->deductions;

        $warnings = [];
        if ($netPay < 0) {
            $warnings[] = 'NEGATIVE_NET';
        }
        $limit = $this->settings['max_deduction_percent'] ?? null;
        if ($limit !== null && $gross > 0 && $input->deductions > Money::percent($gross, (string) $limit)) {
            $warnings[] = 'DEDUCTIONS_OVER_LIMIT';
        }

        return [
            'scheme'                   => $input->scheme,
            'tax_method'               => $this->taxMethodFor($input->taxMethod ?? $scheme['tax_method'])->code(),
            'basic_salary'             => $e['basic'],
            'basic_topup'              => $e['topup'],
            'total_basic'              => $e['total_basic'],
            'housing_allowance'        => $e['housing'],
            'transport_allowance'      => $transport,
            'gross_salary'             => $e['gross_salary'],
            'responsibility_allowance' => $e['responsibility'],
            'arrears'                  => $e['arrears'],
            'total_gross'              => $gross,
            'paye'                     => $tax,
            'maternity_base'           => $statBase,
            'pension_base'             => $gross,
            'hazard_base'              => $statBase,
            'pension_employee'         => $pensionEe,
            'pension_employer'         => $pensionEr,
            'maternity_employee'       => $maternityEe,
            'maternity_employer'       => $maternityEr,
            'hazard_employer'          => $hazardEr,
            'rssb_employee_total'      => $rssbEeTotal,
            'rama_employee'            => $ramaEe,
            'rama_employer'            => $ramaEr,
            'other_insurance'          => $other,
            'net_before_cbhi'          => $netBeforeCbhi,
            'cbhi'                     => $cbhi,
            'net_after_cbhi'           => $netAfterCbhi,
            'deductions'               => $input->deductions,
            'net_pay'                  => $netPay,
            'total_deductions'         => $totalDeductions,
            'employer_cost'            => $employerCost,
            'warnings'                 => $warnings,
        ];
    }

    /** @return array<string, mixed> */
    private function scheme(string $code): array
    {
        if (!isset($this->settings['schemes'][$code])) {
            throw new InvalidArgumentException("Unknown pay scheme: {$code}");
        }
        return $this->settings['schemes'][$code];
    }

    private function taxMethodFor(string $code): TaxMethod
    {
        return match ($code) {
            'PROGRESSIVE'    => new ProgressiveTax($this->settings['paye_bands']),
            'FLAT_SECONDARY' => new FlatTax('FLAT_SECONDARY', (string) $this->settings['flat_rate']),
            'CASUAL_LABOUR'  => new CasualLabourTax((int) $this->settings['casual']['threshold'], (string) $this->settings['casual']['rate']),
            'WITHHOLDING'    => new FlatTax('WITHHOLDING', (string) $this->settings['withholding_rate']),
            'NONE'           => new NoTax(),
            default          => throw new InvalidArgumentException("Unknown tax method: {$code}"),
        };
    }

    /** @param array<string, mixed> $scheme */
    private function validateInput(LineInput $input, array $scheme): void
    {
        foreach (['basic' => $input->basic, 'responsibility' => $input->responsibility, 'arrears' => $input->arrears,
                  'deductions' => $input->deductions, 'otherInsurance' => $input->otherInsurance] as $name => $value) {
            if ($value < 0) {
                throw new InvalidArgumentException("{$name} cannot be negative.");
            }
        }
        if ($input->quantity !== null) {
            Money::assertDecimal($input->quantity);
            if (bccomp($input->quantity, '0', 12) < 0) {
                throw new InvalidArgumentException('quantity cannot be negative.');
            }
        }
        if ($input->enteredGross !== null && $input->enteredGross < 0) {
            throw new InvalidArgumentException('enteredGross cannot be negative.');
        }
        if ($input->targetNet !== null && $input->targetNet < 0) {
            throw new InvalidArgumentException('targetNet cannot be negative.');
        }
        if ($input->taxMethod !== null && !in_array($input->taxMethod, self::TAX_METHODS, true)) {
            throw new InvalidArgumentException("Unknown tax method: {$input->taxMethod}");
        }
        if ($scheme['earnings'] === self::EARN_SALARY && $input->basic <= 0) {
            throw new InvalidArgumentException('basic is required for a salary scheme.');
        }
        if (in_array($scheme['earnings'], [self::EARN_HOURLY, self::EARN_DAILY], true)) {
            if ($input->quantity === null || $input->unitRate === null) {
                throw new InvalidArgumentException('quantity and unitRate are required for this scheme.');
            }
            if ($input->unitRate < 0) {
                throw new InvalidArgumentException('unitRate cannot be negative.');
            }
        }
    }

    /** @param array<string, mixed> $settings */
    private function validateSettings(array $settings): void
    {
        foreach (['topup_rate', 'housing_divisor', 'transport_divisor', 'rates', 'paye_bands', 'flat_rate',
                  'casual', 'withholding_rate', 'cbhi_base', 'statutory_base', 'schemes'] as $key) {
            if (!array_key_exists($key, $settings)) {
                throw new InvalidArgumentException("Payroll settings missing '{$key}'.");
            }
        }
        foreach (self::RATE_KEYS as $key) {
            if (!isset($settings['rates'][$key])) {
                throw new InvalidArgumentException("Payroll settings missing rate '{$key}'.");
            }
            Money::assertDecimal((string) $settings['rates'][$key]);
        }
        if (!in_array($settings['cbhi_base'], self::CBHI_BASES, true)) {
            throw new InvalidArgumentException('cbhi_base must be after_all_insurance or after_paye_and_rssb_only.');
        }
        if (!in_array($settings['statutory_base'], self::STATUTORY_BASES, true)) {
            throw new InvalidArgumentException('statutory_base must be excludes_transport or gross.');
        }
        foreach ($settings['schemes'] as $code => $scheme) {
            if (!in_array($scheme['earnings'] ?? '', self::EARNINGS_MODES, true)) {
                throw new InvalidArgumentException("Scheme {$code} has an unknown earnings mode.");
            }
            if (!in_array($scheme['tax_method'] ?? '', self::TAX_METHODS, true)) {
                throw new InvalidArgumentException("Scheme {$code} has an unknown tax method.");
            }
        }
    }
}
