<?php

declare(strict_types=1);

namespace Tests\Payroll;

use App\Payroll\Runs\PayrollRunService;
use App\Payroll\Settings\SettingsAdmin;
use App\Payroll\Settings\SettingsRepository;
use Core\Database;
use InvalidArgumentException;
use Tests\Payroll\Support\RunDatabase;

/** Phase 8: changes to rates, roles and hourly rates are dated, checked, and audited. */
final class SettingsAdminTest extends PayrollTestCase
{
    private Database $db;
    private SettingsAdmin $admin;

    protected function setUp(): void
    {
        $this->db = RunDatabase::create();
        RunDatabase::loadReference($this->db);
        $this->admin = new SettingsAdmin($this->db);
    }

    /** The 2026 settings with the pension rate changed. */
    private function pensionAt(string $rate): array
    {
        $settings = $this->settings();
        unset($settings['schemes']);
        $settings['rates']['pension_ee'] = $rate;
        $settings['rates']['pension_er'] = $rate;
        return $settings;
    }

    public function testNewVersionIsStoredAndAudited(): void
    {
        $id = $this->admin->addSettingsVersion('2027-01-01', $this->pensionAt('7'), 'pension to 7%', 9);
        $this->assertGreaterThan(0, $id);

        $versions = (new SettingsRepository($this->db))->versions();
        $this->assertSame('2027-01-01', end($versions)['effective_from']);
        $this->assertSame('7', end($versions)['settings']['rates']['pension_ee']);

        $audit = $this->db->fetchAll('SELECT * FROM payroll_audit_log WHERE action = ?', ['settings.version_added']);
        $this->assertCount(1, $audit);
        $this->assertSame('9', (string) $audit[0]['actor_user_id']);
    }

    public function testVersionMustTakeEffectAfterTheLatestOne(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/after 2026-01-01/');
        $this->admin->addSettingsVersion('2025-06-01', $this->pensionAt('7'), 'backdated', 9);
    }

    public function testBrokenSettingsAreNotStored(): void
    {
        $settings = $this->pensionAt('not-a-rate');
        try {
            $this->admin->addSettingsVersion('2027-01-01', $settings, 'bad', 9);
            $this->fail('a rate that is not a number must be refused');
        } catch (InvalidArgumentException) {
            $this->addToAssertionCount(1);
        }
        $this->assertSame(1, (int) $this->db->fetchOne('SELECT COUNT(*) AS n FROM payroll_settings')['n']);
    }

    public function testSchemesAreNotPartOfAVersion(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->admin->addSettingsVersion('2027-01-01', $this->settings(), 'with schemes', 9);
    }

    public function testInvalidDatesAreRefused(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->admin->addSettingsVersion('2027-02-30', $this->pensionAt('7'), 'no such day', 9);
    }

    public function testResponsibilityAmountsAreDatedPerRole(): void
    {
        $this->admin->addResponsibilityAmount('dean', 'Dean', 180000, '2027-01-01', 9);

        // A run in March 2027 sees the new amount; a June 2026 run keeps the old one
        $runs = new PayrollRunService($this->db);
        RunDatabase::addEmployee($this->db, 201, 'Dana', 'Kayitesi');
        $old = $runs->createRun('PERMANENT', '2026-06-01', 'June 2026', 9);
        $new = $runs->createRun('PERMANENT', '2027-03-01', 'March 2027', 9);

        $snapshotOld = json_decode($runs->run($old)['snapshot_json'], true, 512, JSON_THROW_ON_ERROR);
        $snapshotNew = json_decode($runs->run($new)['snapshot_json'], true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame(170018, $snapshotOld['responsibility_amounts']['dean']);
        $this->assertSame(180000, $snapshotNew['responsibility_amounts']['dean']);
    }

    public function testRoleCodesAreTheFixedCurList(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->admin->addResponsibilityAmount('chief_fun_officer', 'Fun', 1000, '2027-01-01', 9);
    }

    public function testHourlyRateRulesAndDating(): void
    {
        $this->admin->addHourlyRate('ASS', 'Assistant Lecturer', 6500, '2027-01-01', 9);

        try {
            $this->admin->addHourlyRate('ASS', 'Assistant Lecturer', 6600, '2026-12-01', 9);
            $this->fail('a rate cannot start before the latest one');
        } catch (InvalidArgumentException) {
            $this->addToAssertionCount(1);
        }
        try {
            $this->admin->addHourlyRate('NEW', 'New grade', 0, '2027-01-01', 9);
            $this->fail('a rate must be above zero');
        } catch (InvalidArgumentException) {
            $this->addToAssertionCount(1);
        }
    }
}
