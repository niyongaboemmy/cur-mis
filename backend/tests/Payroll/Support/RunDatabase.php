<?php

declare(strict_types=1);

namespace Tests\Payroll\Support;

use App\Payroll\Seed\ReferenceSeeder;
use Core\Database;
use PDO;
use ReflectionClass;
use ReflectionProperty;

/**
 * An in-memory SQLite database wrapped in the project's Core\Database, so the payroll services
 * run their real SQL in tests without MySQL.
 *
 * The schema mirrors the MySQL migrations for the tables the services use. It uses SQLite types,
 * so keep it in step with database/migrations when those change.
 */
final class RunDatabase
{
    private const SCHEMA = <<<'SQL'
CREATE TABLE pay_schemes (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, earnings_mode TEXT NOT NULL, default_tax_method TEXT NOT NULL,
    applies_rssb INTEGER NOT NULL DEFAULT 1, applies_hazard INTEGER NOT NULL DEFAULT 1,
    applies_rama INTEGER NOT NULL DEFAULT 0, applies_cbhi INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE payroll_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, effective_from TEXT NOT NULL UNIQUE,
    settings_json TEXT NOT NULL, note TEXT NULL, created_by INTEGER NULL, created_at TEXT NULL
);
CREATE TABLE responsibility_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, role_code TEXT NOT NULL, role_name TEXT NOT NULL,
    monthly_amount NUMERIC NOT NULL DEFAULT 0, effective_from TEXT NOT NULL, created_by INTEGER NULL,
    UNIQUE (role_code, effective_from)
);
CREATE TABLE hourly_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, grade_code TEXT NOT NULL, grade_name TEXT NOT NULL,
    rate_per_hour NUMERIC NOT NULL, effective_from TEXT NOT NULL, created_by INTEGER NULL,
    UNIQUE (grade_code, effective_from)
);
CREATE TABLE banks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, short_code TEXT NULL, is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE employees (
    employee_id INTEGER PRIMARY KEY, employee_fname TEXT, employee_lname TEXT, employee_status TEXT,
    staff_category TEXT, employee_bank TEXT, employee_account TEXT, rssb_number TEXT, salary NUMERIC,
    insurance_type TEXT, insurance_premium NUMERIC, account_status TEXT
);
CREATE TABLE employment_contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL, scheme_code TEXT NOT NULL,
    start_date TEXT NOT NULL, end_date TEXT NULL, basic_salary NUMERIC NOT NULL DEFAULT 0,
    topup_rate NUMERIC NULL, housing_divisor INTEGER NULL, transport_divisor INTEGER NULL,
    responsibility_roles TEXT NULL, tax_method TEXT NULL, tax_method_reason TEXT NULL,
    status TEXT NOT NULL DEFAULT 'Active', created_by INTEGER NULL, created_at TEXT NULL
);
CREATE TABLE payroll_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, scheme_code TEXT NOT NULL, period_date TEXT NOT NULL,
    title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT', settings_effective_from TEXT NOT NULL,
    snapshot_json TEXT NOT NULL, created_by INTEGER NULL, created_at TEXT NULL,
    calculated_at TEXT NULL, verified_by INTEGER NULL, verified_at TEXT NULL,
    approved_by INTEGER NULL, approved_at TEXT NULL, paid_by INTEGER NULL, paid_at TEXT NULL,
    reopen_reason TEXT NULL,
    UNIQUE (scheme_code, period_date)
);
CREATE TABLE payroll_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL, employee_id INTEGER NOT NULL,
    contract_id INTEGER NULL, line_ref TEXT NOT NULL DEFAULT '', employee_name TEXT NOT NULL,
    bank_name TEXT NULL, account_number TEXT NULL, inputs_json TEXT NOT NULL, tax_method TEXT NULL,
    warnings_json TEXT NULL,
    basic_salary NUMERIC NOT NULL DEFAULT 0, basic_topup NUMERIC NOT NULL DEFAULT 0,
    total_basic NUMERIC NOT NULL DEFAULT 0, housing_allowance NUMERIC NOT NULL DEFAULT 0,
    transport_allowance NUMERIC NOT NULL DEFAULT 0, gross_salary NUMERIC NOT NULL DEFAULT 0,
    responsibility_allowance NUMERIC NOT NULL DEFAULT 0, arrears NUMERIC NOT NULL DEFAULT 0,
    total_gross NUMERIC NOT NULL DEFAULT 0, paye NUMERIC NOT NULL DEFAULT 0,
    maternity_base NUMERIC NOT NULL DEFAULT 0, pension_employee NUMERIC NOT NULL DEFAULT 0,
    pension_employer NUMERIC NOT NULL DEFAULT 0, maternity_employee NUMERIC NOT NULL DEFAULT 0,
    maternity_employer NUMERIC NOT NULL DEFAULT 0, hazard_employer NUMERIC NOT NULL DEFAULT 0,
    rssb_employee_total NUMERIC NOT NULL DEFAULT 0, rama_employee NUMERIC NOT NULL DEFAULT 0,
    rama_employer NUMERIC NOT NULL DEFAULT 0, other_insurance NUMERIC NOT NULL DEFAULT 0,
    net_before_cbhi NUMERIC NOT NULL DEFAULT 0, cbhi NUMERIC NOT NULL DEFAULT 0,
    net_after_cbhi NUMERIC NOT NULL DEFAULT 0, deductions NUMERIC NOT NULL DEFAULT 0,
    net_pay NUMERIC NOT NULL DEFAULT 0, total_deductions NUMERIC NOT NULL DEFAULT 0,
    employer_cost NUMERIC NOT NULL DEFAULT 0, gross_up_residual NUMERIC NOT NULL DEFAULT 0,
    UNIQUE (run_id, employee_id, line_ref)
);
CREATE TABLE payroll_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL, line_id INTEGER NULL,
    component TEXT NOT NULL, old_value TEXT NULL, new_value TEXT NULL, reason TEXT NOT NULL,
    created_by INTEGER NULL, created_at TEXT NULL
);
CREATE TABLE payroll_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor_user_id INTEGER NULL, action TEXT NOT NULL,
    entity_type TEXT NOT NULL, entity_id TEXT NULL, before_json TEXT NULL, after_json TEXT NULL,
    ip TEXT NULL, created_at TEXT NULL
);
CREATE TABLE pt_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL, module_code TEXT NOT NULL,
    module_title TEXT NOT NULL, programme TEXT NOT NULL, credits INTEGER NOT NULL DEFAULT 0,
    hours_default NUMERIC NOT NULL DEFAULT 0, hours_paid NUMERIC NULL, hours_override_reason TEXT NULL,
    students INTEGER NULL, grade_code TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
    home_institution TEXT NULL, origin_place TEXT NULL, from_outside_huye INTEGER NOT NULL DEFAULT 0,
    accommodation_nights INTEGER NOT NULL DEFAULT 0, transport_zone TEXT NULL,
    transport_trips INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'REQUESTED',
    requested_by INTEGER NULL, requested_at TEXT NULL, dvca_approved_by INTEGER NULL,
    dvca_approved_at TEXT NULL, invitation_at TEXT NULL, contract_at TEXT NULL, payroll_run_id INTEGER NULL
);
SQL;

    /** A Core\Database on a fresh in-memory SQLite connection with the payroll schema. */
    public static function create(): Database
    {
        $db = (new ReflectionClass(Database::class))->newInstanceWithoutConstructor();
        $pdo = new PDO('sqlite::memory:', null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec(self::SCHEMA);

        $property = new ReflectionProperty(Database::class, 'pdo');
        $property->setAccessible(true);
        $property->setValue($db, $pdo);

        return $db;
    }

    /** Loads the 2026 reference data (schemes, settings, roles, hourly rates, banks). */
    public static function loadReference(Database $db): void
    {
        $settings = require __DIR__ . '/../../../database/seeds/payroll/settings_2026.php';
        $reference = require __DIR__ . '/../../../database/seeds/payroll/reference_2026.php';
        $plan = ReferenceSeeder::plan($settings, $reference);

        foreach ($plan['schemes'] as $row) {
            self::insert($db, 'pay_schemes', $row);
        }
        self::insert($db, 'payroll_settings', $plan['settings']);
        foreach ($plan['roles'] as $row) {
            self::insert($db, 'responsibility_roles', $row);
        }
        foreach ($plan['hourly_rates'] as $row) {
            self::insert($db, 'hourly_rates', $row);
        }
        foreach ($plan['banks'] as $row) {
            self::insert($db, 'banks', $row);
        }
    }

    /** @param array<string, mixed> $row */
    public static function insert(Database $db, string $table, array $row): int
    {
        $columns = array_keys($row);
        $db->execute(
            sprintf(
                'INSERT INTO %s (%s) VALUES (%s)',
                $table,
                implode(', ', $columns),
                implode(', ', array_fill(0, count($columns), '?'))
            ),
            array_values($row)
        );
        return (int) $db->lastInsertId();
    }

    /** Adds an active employee with the fields payroll reads. */
    public static function addEmployee(
        Database $db,
        int $id,
        string $first,
        string $last,
        ?string $bank = 'Equity Bank',
        ?string $account = null,
        string $insurance = 'RAMA',
        string $premium = '0',
    ): void {
        self::insert($db, 'employees', [
            'employee_id'       => $id,
            'employee_fname'    => $first,
            'employee_lname'    => $last,
            'employee_status'   => 'Permanent',
            'staff_category'    => 'Academic',
            'employee_bank'     => $bank,
            'employee_account'  => $account ?? (string) (1000 + $id),
            'rssb_number'       => 'R' . $id,
            'salary'            => '0',
            'insurance_type'    => $insurance,
            'insurance_premium' => $premium,
            'account_status'    => 'Active',
        ]);
    }
}
