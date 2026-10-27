# HR payroll

How CUR payroll is calculated, configured, and run. Written for HR and Finance staff and for the developers who maintain it.

## 1. What it covers

- Monthly payroll **runs**, one per pay scheme per month, from draft to paid.
- Seven pay schemes: permanent staff, support staff, part-time lecturers, masters/PG incentive, transport allowance, casual workers, consultancy.
- Employee **contracts** (salary history), a **part-time** module workflow, and **rates** that change by date.
- Exports: the run sheet in CUR's column order, the bank transfer list, statutory totals, and payslips (PDF).

All amounts are whole RWF. Each line is rounded half-up to a whole RWF before it is used or added up. Money is never a float.

## 2. The calculation

Permanent and support staff (`SALARY`):

| Step | Figure | Formula |
|---|---|---|
| E | Basic top-up | basic × top-up rate (11.68228% by default; per contract for support staff) |
| F | Total basic | basic + top-up |
| G | Housing | total basic ÷ housing divisor (7; 0 = none) |
| H | Transport | total basic ÷ transport divisor (7; 0 = none) |
| I | Gross salary | total basic + housing + transport |
| – | Total gross | gross salary + responsibility allowance + arrears |
| – | PAYE | progressive bands on total gross (below) |
| – | Statutory base | total gross − transport (setting `statutory_base`) |
| – | Pension | total gross × 6% employee, × 6% employer |
| – | Maternity | statutory base × 0.3% employee, × 0.3% employer |
| – | Hazard (employer) | statutory base × 2% |
| – | RAMA | statutory base × 7.5% each side, only if the employee is on RAMA |
| – | Other insurance | the employee's monthly premium, if on another insurer (e.g. RADIANT) |
| – | Net before CBHI | total gross − PAYE − RSSB employee − RAMA − other insurance (setting `cbhi_base`) |
| – | CBHI | net before CBHI × 0.5% |
| – | Net pay | net before CBHI − CBHI − other deductions |

Other schemes use the same statutory lines, with their own earnings and tax rules:

| Scheme | Earnings | Tax | Statutory |
|---|---|---|---|
| PERMANENT, SUPPORT | Salary (above) | Progressive | RSSB, hazard, RAMA, CBHI |
| PART_TIME | Hours × hourly rate | Flat 30% | RSSB (no hazard, no RAMA), CBHI |
| PG_INCENTIVE | Typed gross, or gross-up from a target net | Flat 30% (default) | RSSB, hazard, CBHI |
| TRANSPORT | Typed gross | Flat 30% | RSSB, hazard, CBHI |
| CASUAL | Days × daily rate | Progressive, or casual labour per worker | RSSB, hazard, CBHI |
| CONSULTANCY | Typed gross, or gross-up from a target net | Flat 30% | none |

**PAYE bands (monthly, progressive):** 0 to 60,000 at 0%; 60,001 to 100,000 at 10%; 100,001 to 200,000 at 20%; above 200,000 at 30%. The bands are part of each settings version, so they can change by date.

**Casual labour:** nil up to 60,000 a month, then 15% on the excess.

**Gross-up:** finds the largest gross whose net pay is at most the target, by binary search on whole RWF. The residual is reported when the target cannot be hit exactly. Example: a consultancy target of 400,000 gives gross 571,429.

### Things that are not hard-coded

Every rate, divisor, PAYE band, the CBHI base, the statutory base, the flat rate, and the casual threshold live in a **settings version**. Responsibility amounts and hourly rates have their own dated tables. Pay schemes (which statutory lines apply, and the default tax method) live in `pay_schemes`.

## 3. Settings and versions

A **settings version** takes effect from a date. A run uses the version in force on its period date, and stores a **snapshot** (the settings, responsibility amounts and hourly rates) when it is created. Later changes never alter an existing run.

- A new version must take effect after the latest one. Past periods cannot be rewritten.
- A version is checked by the engine before it is saved. A rate that cannot calculate is refused.
- Responsibility amounts and hourly rates are dated per code, with the same rule.
- Every change is written to the audit log with who made it.

Example: the pension rate moves to 7% from 1 January 2027. A March 2027 run uses 7%. A June 2026 run keeps 6%, even when recalculated.

## 4. Workflow and roles

```
DRAFT ──calculate──▶ CALCULATED ──verify──▶ VERIFIED ──approve──▶ APPROVED ──pay──▶ PAID
  ▲                     │  ▲                   │                    │
  └────── edit ─────────┘  └──── send back ────┘                    └── reopen (with reason) ─▶ CALCULATED
```

- Lines can be added, changed or removed, and the run recalculated, only in DRAFT or CALCULATED.
- A change to a line needs a **reason**. Each changed input is recorded as an adjustment, with the old and new values.
- The person who prepared a run cannot verify it. The verifier cannot approve it. Approval needs a different person from both.
- **Mark paid** needs an account number on every line, and no negative net pay.
- PAID is final. A reopened run needs a reason and is audited.

| Permission | Who (typical) | Can |
|---|---|---|
| `VIEW_PAYROLL` | HR, finance, payroll officers | See runs, lines, exports, payslips, contracts, part-time requests |
| `MANAGE_PAYROLL` | HR officers | Create runs, add and change lines, calculate, verify, manage contracts, request part-time modules |
| `APPROVE_PAYROLL` | Director of Finance (DAF) | Approve, mark paid, reopen; change rates, responsibility amounts and hourly rates |

`APPROVE_PAYROLL` is granted to Superadmin by migration `2026_10_16_003`. Assign it to the DAF role in the role screens, and remove it from anyone who only prepares payroll.

Part-time steps (requester, DVCA approval, invitation, contract, send to payroll) need `MANAGE_PAYROLL`. The requester cannot approve their own module. Give the DVCA step its own permission when CUR decides who holds it.

## 5. Part-time teaching

1. **Request** a module: lecturer, module, programme (Day, Weekend, Holiday), credits, grade, teaching period, and any accommodation or transport. Hours default to credits × 4.
2. **DVCA approval.**
3. **Invitation** letter (PDF).
4. **Contract** (PDF), once the invitation has been issued.
5. **Send to payroll:** adds the module to a PART_TIME run for the month it is taught. Hours are locked from this point.

Accommodation (8,825 a night, for lecturers from outside Huye) and transport (7,480 per trip from Kigali, 4,000 from elsewhere) are paid as a **separate, non-taxable reimbursement**, not through the run. The rates are in `part_time_allowances` in the settings. The reimbursement endpoint returns the amounts owed.

A lecturer with several modules in one month gets **one bank payment**, with the nets added together.

## 6. Exports and payslips

- **Run sheet** (Excel, sheet "Payroll"): CUR's order (No, first name, last name, Basic Salary … NET PAY). Employee and employer columns are labelled. A totals row closes the sheet. The headings carry no rates, so a rate change needs no edit.
- **Bank transfers** (Excel, sheet "Bank transfers"): grouped by bank, one line per person, with a total per bank and a grand total.
- **Statutory** (Excel, sheet "Statutory"): PAYE (RRA); RSSB pension, maternity and hazard; RAMA; CBHI. Employee and employer shares are separate.
- **Payslip** (PDF, one per person per run): earnings, deductions, employer contributions, and net pay. The account number is masked to the last four digits.

Run exports and payslip downloads are written to the audit log. Part-time letters are not logged yet.

## 7. Data quality

The data-quality report (`/hr/payroll-data-quality`) checks active staff before a run. It reports missing or unlisted banks, account numbers that contain letters (often a bank name), missing RSSB numbers, unknown employment types, missing staff categories, zero or negative salaries, and insurance problems. It changes nothing; HR fixes the records in the employee file.

## 8. Setting up

```bash
cd backend
php scripts/migrate.php                    # apply the payroll migrations
php scripts/seed_payroll_reference.php     # schemes, 2026 settings, roles, hourly rates, banks (keeps existing rows)
php scripts/seed_payroll_reference.php --dry-run   # preview only
php scripts/seed_payroll_samples.php --confirm     # development databases only: five sample staff
```

Then, as an HR officer, open **Payroll runs**, create a run, add contracts, generate and calculate, and send it for verification. A different person verifies, then approves.

Migrations, in order: `2026_10_16_001` (reference tables), `002` (contracts, runs, lines, adjustments, part-time), `003` (the `APPROVE_PAYROLL` permission).

The seed for banks is a partial list: **Bank of Kigali, Equity Bank, BPR, I&M Bank**. HR must complete it.

## 9. Tests

```bash
cd backend
php vendor/bin/phpunit -c phpunit.xml.dist
```

The suite runs without MySQL. Run-workflow, part-time, contract and settings tests use an in-memory SQLite database through the real services. The schema for those tests is in `tests/Payroll/Support/RunDatabase.php` and must be kept in step with the MySQL migrations.

## 10. Decisions taken, and what to confirm with CUR

| Topic | Choice made | Confirm |
|---|---|---|
| Golden case | Test 1 (RAMA and the RADIANT premium both taken) is calculated with explicit flags. Generated runs follow the spec's rule: RAMA only for RAMA members | Whether an OTHER-insurer employee also pays RAMA |
| Support staff net | The formulas give 115,969; the spec states 115,971 | Which is right |
| Casual net | The formulas give 256,050; the spec states 256,051 (CBHI 1,286.7 rounds to 1,287) | Rounding of CBHI |
| Responsibility amounts | Copied from the existing payroll defaults | Current amounts |
| Hourly grades TUT and PGL | Codes assigned here; tutorial rate 5,857 | Codes, and 5,857 vs 5,800 |
| Tax on PG incentive | Flat 30% (the scheme default) | Progressive or flat |
| Consultancy tax | Flat 30% | Flat or withholding |
| Hazard for part-time | Off | Confirm |
| CBHI base | After RAMA and other insurance, as in the CUR sheet | Confirm (setting `cbhi_base`) |
| Reimbursements | Separate, non-taxable, outside the run | Confirm |
| Invitation and contract wording | Placeholder | CUR's official templates |
| Old `PayrollCalculator` | Left unchanged, so live payslips do not move | Migration plan to the new engine |

## 11. Known gaps

- **Recurring deductions** (advances with balances and instalments) are not modelled yet. Deductions are entered per line, with a reason.
- **Self-service payslips** for employees are not in this release. Payslips are downloaded by HR.
- **Employee profile link** from the lines grid: the profile page takes an employee ID.
- **Scheme-level settings** (which statutory lines apply) are structure in `pay_schemes`, not versioned.
- The **old payroll** (`hr_payroll`, `payroll_config`, `PayrollCalculator`) still exists, and is not synchronised with the new runs.
- **Database verification:** the migrations and the MySQL-specific SQL were written and reviewed but could not be executed in this environment. Run the migrations on a development database before relying on them.
