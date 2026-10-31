<?php

declare(strict_types=1);

namespace Tests\Payroll;

use App\Payroll\DataQuality\EmployeeDataChecker;
use App\Payroll\DataQuality\PayrollDataQualityReport;
use PHPUnit\Framework\TestCase;

/** Phase 2: data-quality rules for employee rows (spec §1). Pure, no database. */
final class EmployeeDataCheckerTest extends TestCase
{
    private function checker(?string $reviewAbove = null): EmployeeDataChecker
    {
        return new EmployeeDataChecker(['Bank of Kigali', 'Equity Bank', 'BPR', 'I&M Bank'], $reviewAbove);
    }

    /** A row with every field correct. Each test changes only what it is about. */
    private function clean(): array
    {
        return [
            'employee_status'   => 'Permanent',
            'staff_category'    => 'Academic',
            'employee_bank'     => 'Equity Bank',
            'employee_account'  => '0012345678',
            'rssb_number'       => 'RSSB-998877',
            'salary'            => '1647309.00',
            'insurance_type'    => 'RAMA',
            'insurance_premium' => '0.00',
        ];
    }

    /** @return list<string> */
    private function codes(array $row, ?string $reviewAbove = null): array
    {
        return array_column($this->checker($reviewAbove)->check($row), 'code');
    }

    public function testCleanRowHasNoIssues(): void
    {
        $this->assertSame([], $this->codes($this->clean()));
    }

    public function testMissingBankAndAccountAreErrors(): void
    {
        $row = $this->clean();
        $row['employee_bank'] = '';
        $row['employee_account'] = '';

        $issues = $this->checker()->check($row);
        $byCode = array_column($issues, 'severity', 'code');

        $this->assertSame('error', $byCode['MISSING_BANK']);
        $this->assertSame('error', $byCode['MISSING_ACCOUNT']);
    }

    public function testBankFieldHoldingANumberIsAnError(): void
    {
        $row = $this->clean();
        $row['employee_bank'] = '0012345678';
        $this->assertContains('BANK_HOLDS_NUMBER', $this->codes($row));
    }

    public function testAccountWithLettersIsAnError(): void
    {
        $row = $this->clean();
        $row['employee_account'] = 'Equity Bank';
        $this->assertContains('ACCOUNT_HAS_LETTERS', $this->codes($row));
    }

    public function testBankNotInListIsAWarning(): void
    {
        $row = $this->clean();
        $row['employee_bank'] = 'Cogebanque';
        $issues = $this->checker()->check($row);

        $this->assertSame('BANK_NOT_IN_LIST', $issues[0]['code']);
        $this->assertSame('warning', $issues[0]['severity']);
    }

    public function testBankMatchIsCaseAndSpaceInsensitive(): void
    {
        $row = $this->clean();
        $row['employee_bank'] = '  equity bank ';
        $this->assertSame([], $this->codes($row));
    }

    public function testUnknownEmploymentStatusIsReported(): void
    {
        foreach (['0', '1', 'active', '', 'Contract'] as $status) {
            $row = $this->clean();
            $row['employee_status'] = $status;
            $this->assertContains('UNKNOWN_EMPLOYMENT_TYPE', $this->codes($row), "status '{$status}'");
        }
    }

    public function testEmploymentTypeMapsSpellings(): void
    {
        $checker = $this->checker();
        $this->assertSame('Permanent', $checker->employmentType(' permanent '));
        $this->assertSame('Part-time', $checker->employmentType('Part-time'));
        $this->assertSame('Part-time', $checker->employmentType('part time'));
        $this->assertNull($checker->employmentType('0'));
    }

    public function testMissingRssbIsAWarning(): void
    {
        $row = $this->clean();
        $row['rssb_number'] = null;
        $this->assertContains('MISSING_RSSB', $this->codes($row));
    }

    public function testStaffCategoryRules(): void
    {
        $row = $this->clean();
        $row['staff_category'] = null;
        $this->assertContains('MISSING_STAFF_CATEGORY', $this->codes($row));

        $row['staff_category'] = 'Support';
        $this->assertContains('INVALID_STAFF_CATEGORY', $this->codes($row));
    }

    public function testSalaryRules(): void
    {
        $row = $this->clean();
        $row['salary'] = '-500.00';
        $this->assertContains('NEGATIVE_SALARY', $this->codes($row));

        $row['salary'] = '0.00';
        $this->assertContains('ZERO_SALARY', $this->codes($row));

        $row['salary'] = 'abc';
        $this->assertContains('INVALID_SALARY', $this->codes($row));
    }

    public function testSalaryReviewLevelIsOffUnlessSet(): void
    {
        $row = $this->clean();
        $row['salary'] = '20000000.00';

        $this->assertNotContains('SALARY_ABOVE_REVIEW_LEVEL', $this->codes($row));
        $this->assertContains('SALARY_ABOVE_REVIEW_LEVEL', $this->codes($row, '10000000'));
    }

    public function testInsuranceRules(): void
    {
        $row = $this->clean();
        $row['insurance_type'] = null;
        $this->assertContains('MISSING_INSURANCE_TYPE', $this->codes($row));

        $row['insurance_type'] = 'Mutuelle';
        $this->assertContains('INVALID_INSURANCE_TYPE', $this->codes($row));

        $row['insurance_type'] = 'OTHER';
        $row['insurance_premium'] = '0';
        $this->assertContains('OTHER_INSURANCE_NO_PREMIUM', $this->codes($row));

        $row['insurance_premium'] = '82620';
        $this->assertNotContains('OTHER_INSURANCE_NO_PREMIUM', $this->codes($row));
    }

    public function testMaskAccountShowsOnlyTheLastFour(): void
    {
        $this->assertSame('******5678', PayrollDataQualityReport::maskAccount('0012345678'));
        $this->assertSame('', PayrollDataQualityReport::maskAccount(''));
        $this->assertSame('ab', PayrollDataQualityReport::maskAccount('ab'));
    }
}
