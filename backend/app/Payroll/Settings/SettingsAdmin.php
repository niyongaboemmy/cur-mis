<?php

declare(strict_types=1);

namespace App\Payroll\Settings;

use App\Payroll\Engine\PayrollEngine;
use App\Services\PayrollCalculator;
use Core\Database;
use InvalidArgumentException;

/**
 * Adds new versions of payroll rates, PAYE bands, responsibility amounts and hourly rates.
 *
 * Rules:
 *   - A new version must take effect after the latest one for the same item. Past periods never change;
 *     the runs made in them keep their own snapshot anyway.
 *   - A settings version is checked by the engine before it is saved, so a broken rate cannot be stored.
 *   - Every addition is written to payroll_audit_log with the actor and the new values.
 */
final class SettingsAdmin
{
    public function __construct(private Database $db)
    {
    }

    /**
     * @param array<string, mixed> $settings engine settings without 'schemes' (those live in pay_schemes)
     */
    public function addSettingsVersion(string $effectiveFrom, array $settings, string $note, int $actorId): int
    {
        $this->assertDate($effectiveFrom);
        if (array_key_exists('schemes', $settings)) {
            throw new InvalidArgumentException('Pay schemes are not part of a settings version. Change them with the scheme table.');
        }
        $this->assertLaterThan('payroll_settings', 'effective_from', null, null, $effectiveFrom);

        // The engine refuses a settings document that cannot calculate, so nothing broken is stored
        $schemeRows = $this->db->fetchAll(
            'SELECT `code`, `earnings_mode`, `default_tax_method`, `applies_rssb`, `applies_hazard`, `applies_rama`, `applies_cbhi`
               FROM `pay_schemes` WHERE `is_active` = 1'
        );
        $json = json_encode($settings, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        new PayrollEngine(SettingsRepository::assemble($json, $schemeRows));

        $this->db->execute(
            'INSERT INTO `payroll_settings` (`effective_from`, `settings_json`, `note`, `created_by`) VALUES (?, ?, ?, ?)',
            [$effectiveFrom, $json, $note, $actorId]
        );
        $id = (int) $this->db->lastInsertId();
        $this->audit($actorId, 'settings.version_added', 'payroll_settings', (string) $id, null,
            ['effective_from' => $effectiveFrom, 'note' => $note]);
        return $id;
    }

    /** Responsibility allowance for one role from a date. Role codes are the fixed CUR list. */
    public function addResponsibilityAmount(string $roleCode, string $roleName, int $amount, string $effectiveFrom, int $actorId): void
    {
        PayrollCalculator::parseRoles($roleCode);
        $this->assertDate($effectiveFrom);
        $this->assertWholeAmount($amount, 'Responsibility amount');
        $this->assertLaterThan('responsibility_roles', 'effective_from', 'role_code', $roleCode, $effectiveFrom);

        $this->db->execute(
            'INSERT INTO `responsibility_roles` (`role_code`, `role_name`, `monthly_amount`, `effective_from`, `created_by`)
             VALUES (?, ?, ?, ?, ?)',
            [$roleCode, $roleName, $amount, $effectiveFrom, $actorId]
        );
        $this->audit($actorId, 'role.amount_added', 'responsibility_roles', $roleCode, null,
            ['amount' => $amount, 'effective_from' => $effectiveFrom]);
    }

    public function addHourlyRate(string $gradeCode, string $gradeName, int $rate, string $effectiveFrom, int $actorId): void
    {
        if (trim($gradeCode) === '' || trim($gradeName) === '') {
            throw new InvalidArgumentException('A grade needs a code and a name.');
        }
        $this->assertDate($effectiveFrom);
        if ($rate <= 0) {
            throw new InvalidArgumentException('An hourly rate must be more than zero.');
        }
        $this->assertLaterThan('hourly_rates', 'effective_from', 'grade_code', $gradeCode, $effectiveFrom);

        $this->db->execute(
            'INSERT INTO `hourly_rates` (`grade_code`, `grade_name`, `rate_per_hour`, `effective_from`, `created_by`)
             VALUES (?, ?, ?, ?, ?)',
            [$gradeCode, $gradeName, $rate, $effectiveFrom, $actorId]
        );
        $this->audit($actorId, 'hourly.rate_added', 'hourly_rates', $gradeCode, null,
            ['rate' => $rate, 'effective_from' => $effectiveFrom]);
    }

    private function assertDate(string $date): void
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !checkdate((int) substr($date, 5, 2), (int) substr($date, 8, 2), (int) substr($date, 0, 4))) {
            throw new InvalidArgumentException("Effective date must be a real date as YYYY-MM-DD, got {$date}.");
        }
    }

    private function assertWholeAmount(int $amount, string $label): void
    {
        if ($amount < 0) {
            throw new InvalidArgumentException("{$label} cannot be negative.");
        }
    }

    /** The new date must be after the latest existing version for the same item (or any version, when no key). */
    private function assertLaterThan(string $table, string $dateColumn, ?string $keyColumn, ?string $key, string $date): void
    {
        $sql = "SELECT MAX(`{$dateColumn}`) AS `latest` FROM `{$table}`";
        $bindings = [];
        if ($keyColumn !== null) {
            $sql .= " WHERE `{$keyColumn}` = ?";
            $bindings[] = $key;
        }
        $latest = $this->db->fetchOne($sql, $bindings)['latest'] ?? null;
        if ($latest !== null && $date <= (string) $latest) {
            throw new InvalidArgumentException("A new version must take effect after {$latest}.");
        }
    }

    /** @param array<string, mixed>|null $before */
    private function audit(int $actorId, string $action, string $entity, string $entityId, ?array $before, ?array $after): void
    {
        $this->db->execute(
            'INSERT INTO `payroll_audit_log` (`actor_user_id`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`)
             VALUES (?, ?, ?, ?, ?, ?)',
            [
                $actorId,
                $action,
                $entity,
                $entityId,
                $before === null ? null : json_encode($before, JSON_THROW_ON_ERROR),
                $after === null ? null : json_encode($after, JSON_THROW_ON_ERROR),
            ]
        );
    }
}
