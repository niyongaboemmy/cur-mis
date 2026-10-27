<?php

declare(strict_types=1);

namespace App\Payroll\DataQuality;

/**
 * Checks one employee row for data that would break or distort payroll.
 *
 * Pure: it looks at the row it is given and at the bank list it was built with. It changes
 * nothing. Fixing a problem is always a deliberate edit by HR (spec §1: never auto-fix silently).
 *
 * Severity:
 *   error   – blocks payment or makes the figures wrong (no account, account with letters, negative salary)
 *   warning – needs HR to confirm (unknown employment type, no RSSB number, unlisted bank, ...)
 */
final class EmployeeDataChecker
{
    public const SEVERITY_ERROR   = 'error';
    public const SEVERITY_WARNING = 'warning';

    /** Employment types the payroll understands. Anything else in employee_status is unknown. */
    public const EMPLOYMENT_TYPES = ['Permanent', 'Part-time'];

    private const STAFF_CATEGORIES = ['Academic', 'Administrative'];
    private const INSURANCE_TYPES  = ['RAMA', 'OTHER'];

    /** @var list<string> lower-cased, trimmed bank names */
    private array $bankKeys;

    /**
     * @param list<string> $bankNames      active bank names from the banks table
     * @param string|null  $salaryReviewAbove decimal string; salaries above it get a review warning (null = off)
     */
    public function __construct(array $bankNames, private ?string $salaryReviewAbove = null)
    {
        $this->bankKeys = array_values(array_unique(array_map(
            static fn (string $name): string => mb_strtolower(trim($name)),
            $bankNames
        )));
    }

    /**
     * @param array<string, mixed> $employee a row from the employees table (never password or OTP columns)
     * @return list<array{code: string, severity: string, field: string, message: string}>
     */
    public function check(array $employee): array
    {
        $issues = [];

        $bank    = trim((string) ($employee['employee_bank'] ?? ''));
        $account = trim((string) ($employee['employee_account'] ?? ''));

        // Bank
        if ($bank === '') {
            $issues[] = $this->issue('MISSING_BANK', self::SEVERITY_ERROR, 'employee_bank', 'No bank recorded.');
        } elseif (preg_match('/\d{5,}/', $bank)) {
            $issues[] = $this->issue('BANK_HOLDS_NUMBER', self::SEVERITY_ERROR, 'employee_bank',
                'The bank field holds a number, probably the account number.');
        } elseif (!in_array(mb_strtolower($bank), $this->bankKeys, true)) {
            $issues[] = $this->issue('BANK_NOT_IN_LIST', self::SEVERITY_WARNING, 'employee_bank',
                "\"{$bank}\" is not in the bank list.");
        }

        // Account
        if ($account === '') {
            $issues[] = $this->issue('MISSING_ACCOUNT', self::SEVERITY_ERROR, 'employee_account',
                'No account number. Required before the payment is marked PAID.');
        } elseif (preg_match('/[A-Za-z]/', $account)) {
            $issues[] = $this->issue('ACCOUNT_HAS_LETTERS', self::SEVERITY_ERROR, 'employee_account',
                'The account number contains letters, so it may be a bank name.');
        }

        // Identity and statutory numbers
        if (trim((string) ($employee['rssb_number'] ?? '')) === '') {
            $issues[] = $this->issue('MISSING_RSSB', self::SEVERITY_WARNING, 'rssb_number', 'No RSSB number.');
        }

        // Employment type
        $rawStatus = (string) ($employee['employee_status'] ?? '');
        if ($this->employmentType($rawStatus) === null) {
            $shown = trim($rawStatus) === '' ? '(blank)' : trim($rawStatus);
            $issues[] = $this->issue('UNKNOWN_EMPLOYMENT_TYPE', self::SEVERITY_WARNING, 'employee_status',
                "Employment status \"{$shown}\" is not Permanent or Part-time.");
        }

        // Staff category
        $category = trim((string) ($employee['staff_category'] ?? ''));
        if ($category === '') {
            $issues[] = $this->issue('MISSING_STAFF_CATEGORY', self::SEVERITY_WARNING, 'staff_category',
                'Staff category (Academic or Administrative) is not set.');
        } elseif (!in_array($category, self::STAFF_CATEGORIES, true)) {
            $issues[] = $this->issue('INVALID_STAFF_CATEGORY', self::SEVERITY_WARNING, 'staff_category',
                "Staff category \"{$category}\" is not Academic or Administrative.");
        }

        // Salary
        $salary = trim((string) ($employee['salary'] ?? ''));
        if ($salary === '' || !preg_match('/^-?\d+(\.\d+)?$/', $salary)) {
            $issues[] = $this->issue('INVALID_SALARY', self::SEVERITY_ERROR, 'salary', 'Salary is not a number.');
        } elseif (bccomp($salary, '0', 2) < 0) {
            $issues[] = $this->issue('NEGATIVE_SALARY', self::SEVERITY_ERROR, 'salary', 'Salary is negative.');
        } elseif (bccomp($salary, '0', 2) === 0) {
            $issues[] = $this->issue('ZERO_SALARY', self::SEVERITY_WARNING, 'salary', 'Salary is zero.');
        } elseif ($this->salaryReviewAbove !== null && bccomp($salary, $this->salaryReviewAbove, 2) > 0) {
            $issues[] = $this->issue('SALARY_ABOVE_REVIEW_LEVEL', self::SEVERITY_WARNING, 'salary',
                "Salary is above the review level of {$this->salaryReviewAbove} RWF. Check it.");
        }

        // Insurance
        $insurance = strtoupper(trim((string) ($employee['insurance_type'] ?? '')));
        $premium   = trim((string) ($employee['insurance_premium'] ?? '0'));
        if ($insurance === '') {
            $issues[] = $this->issue('MISSING_INSURANCE_TYPE', self::SEVERITY_WARNING, 'insurance_type',
                'Health insurance type (RAMA or OTHER) is not set.');
        } elseif (!in_array($insurance, self::INSURANCE_TYPES, true)) {
            $issues[] = $this->issue('INVALID_INSURANCE_TYPE', self::SEVERITY_WARNING, 'insurance_type',
                "Insurance type \"{$insurance}\" is not RAMA or OTHER.");
        } elseif ($insurance === 'OTHER' && (!preg_match('/^\d+(\.\d+)?$/', $premium) || bccomp($premium, '0', 2) <= 0)) {
            $issues[] = $this->issue('OTHER_INSURANCE_NO_PREMIUM', self::SEVERITY_WARNING, 'insurance_premium',
                'Insurance is OTHER but no monthly premium is set.');
        }

        return $issues;
    }

    /** Returns 'Permanent', 'Part-time', or null when the raw status does not map to a known type. */
    public function employmentType(string $rawStatus): ?string
    {
        $key = mb_strtolower(trim($rawStatus));
        if ($key === 'permanent') {
            return 'Permanent';
        }
        if (in_array($key, ['part-time', 'part time', 'parttime'], true)) {
            return 'Part-time';
        }
        return null;
    }

    /** @return array{code: string, severity: string, field: string, message: string} */
    private function issue(string $code, string $severity, string $field, string $message): array
    {
        return ['code' => $code, 'severity' => $severity, 'field' => $field, 'message' => $message];
    }
}
