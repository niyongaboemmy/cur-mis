# MIS Revision Request — Gap Analysis & Implementation Plan

**Prepared for:** MIS Revision Request (Finance modules, RBAC, HR sign-off)
**Prepared by:** Business analysis against current `cur-mis` codebase
**Date:** 2026-07-15
**Status:** Draft for stakeholder review

---

## 1. Executive Summary

The client's request has 7 sections. Against the current codebase, they split into three tiers:

| Tier | Sections | Characterization |
|---|---|---|
| **Extend existing** | 1. Fees Structure, 6. RBAC, 7. HR functional check | Solid foundation exists; work is schema additions + gap-filling, not rebuilds |
| **Partial foundation, real build** | 2. Student Directory (Finance view), 4. Postgraduate/International Fees | Underlying data exists (student table, `program_level` enum) but the requested view/table doesn't |
| **Build from scratch** | 3. Budget Execution, 5. Payment Calendar | Only a thin placeholder (Budget) or nothing (Calendar) exists today |

None of the 7 items require a rewrite of existing modules. All can be delivered additively (new columns, new tables, new pages) without breaking current Finance/Registrar/HR functionality, provided migrations follow the project's existing idempotent, sequentially-numbered convention in `backend/database/migrations/`.

**Recommended sequencing:** RBAC groundwork first (Phase 0), since every other section depends on correct permission scoping for its new endpoints/pages. Then Fees Structure (highest business value, lowest lift), then Student Directory (Finance), then Budget Execution and Payment Calendar (the two build-from-scratch items, similar effort profile, can run in parallel workstreams), then Postgraduate/International Fees (depends on Fees Structure schema being finalized first), then HR functional sign-off as a QA pass that can run throughout.

---

## 2. Current-State Findings (by section)

### 2.1 Academic Fees Structure — *mostly built*
- `fee_structures` table already has: `academic_year_id`, `department_id` (program), `level_id` (study level), `fee_type` (now a proper `fee_types` lookup table), `label`, `amount`, `semester`, `payment_plan`, `installment_count`, `is_active`.
- `FeeController.php` (~3000 lines) already does create/update/list with a `fee_structure_departments` join table for multi-department fees, and `FeeStructureModel::findBestMatch()` for resolution logic.
- Frontend: `FeeStructuresPage.tsx`, `FeeTypesPage.tsx`, `FeeMappingPanel.tsx` exist.
- **Gaps:** no `student_category` (local/international, sponsored/self-sponsored) dimension on `fee_structures`; no `currency` column; "Payment Terms" is implicit in `payment_plan`/`installment_count` rather than an explicit due-date schedule (ties into §2.5 Payment Calendar).

### 2.2 Student Directory (Finance View) — *data exists, dedicated view does not*
- `StudentController::index()` already supports rich filtering (faculty, department, level, nationality, category, campus, intake, learning_mode) and the `student` table has `phone`/`email`.
- **Gaps:** no next-of-kin/guardian **contact** fields (only `father`/`mother` name columns exist — no phone/email for guardians); no Finance-scoped route/permission (Finance currently reuses `/api/students` via `StudentSearchSelect.tsx`, a search-only widget, not a full directory page); no link from a student row directly to fee/payment status in one view.

### 2.3 Budget Execution — *placeholder only, effectively new*
- `expense_budgets` table exists (`academic_year_id`, `category_id`, `amount`) with actual-spend computed by summing `expenses`. This lives as a tab inside `ExpensesPage.tsx`, not a standalone module.
- **Gaps:** no department/cost-center dimension, no explicit Planned/Spent/Balance/Variance columns as a first-class report, no year-over-year comparison view, no overspend flagging, no Excel/PDF export. This is the largest genuinely new build in the request.

### 2.4 Postgraduate Fees — International Students — *foundation exists, differentiation logic doesn't*
- `departements.program_level` ENUM already distinguishes `undergraduate`/`postgraduate`/`diploma`/`certificate`.
- `StudentController::listInternational()` and visa-tracking tables already identify international students.
- **Gaps:** `fee_structures` doesn't branch on `program_level` or nationality/region; no currency/FX handling anywhere in fee tables (only `student_applications.payment_currency` exists, and only at the application-fee stage); no distinct table/view kept separate from local/undergraduate fees as the client explicitly requested.

### 2.5 Payment Calendar — *does not exist*
- `academic_years`/`academic_terms` have start/end dates; `fee_invoices.due_date` is a single computed date per invoice. There is no stored, admin-configurable schedule of installment due dates, penalty start dates, or registration deadlines.
- **Gap:** entirely new table + CRUD + calendar UI.

### 2.6 Role-Based Access Control — *mature, module-level*
- Full RBAC stack: `roles`, `permissions` (95 slugs in `Permissions.php`), `role_permissions`, enforced via `PermissionMiddleware` on the backend and `ProtectedRoute.tsx`/`permissions.ts` on the frontend. Admin UI exists (`RolesManagementPage.tsx`, `PermissionsManagementPage.tsx`) — admins can already reassign roles/permissions without a deployment.
- Roles today: `superadmin`, `admin`, `registrar`, `hr_manager`, `lecturer`, `finance_officer`, `applicant`, `student` (+ campus-scoped assignments).
- **Gaps relative to the client's table:** permissions are module/action-level, not object-level — e.g. there's no built-in mechanism to say "Finance can view budgets but not payroll amounts" beyond gating whole endpoints. The client's Cannot-Access column (Finance ⛔ HR salaries & registrar academic non-financial data; Registrar ⛔ budget & payroll) needs to be **verified and closed with explicit negative-permission checks**, not assumed from the current catalog. `superadmin`/`admin` bypass all checks by design (acceptable per client's Admin/IT row).

### 2.7 HR Department — *functionally complete, needs a verification pass, not a build*
- Staff records, leave management (types, requests, balances, self-service), and payroll (statutory RSSB/RAMA/maternity/CBHI deductions, payslips, Excel import, approval workflow) are all implemented with real tables and full CRUD controllers.
- **Gap:** no evidence of a formal cross-department access test confirming HR data is actually walled off from Finance/Registrar per §2.6 — this is a **verification task**, not new development.

---

## 3. Implementation Plan

### Phase 0 — RBAC Hardening & Test Harness (prerequisite, ~3–5 days)
Everything downstream needs correct permission scoping, and this is the cheapest phase to get wrong later.
1. Enumerate the client's Can View / Can Edit / Cannot Access matrix (§6 of the request) as explicit permission slugs, extending `Permissions.php` where gaps exist (e.g. `VIEW_BUDGET_EXECUTION`, `VIEW_PAYMENT_CALENDAR`, `VIEW_STUDENT_DIRECTORY_FINANCE`).
2. Add negative-access integration tests: log in as each of Finance / Registrar / HR / Admin and assert 403s on out-of-scope endpoints (HR salary endpoints for Finance/Registrar, budget/payroll endpoints for Registrar, student financial data for HR).
3. Audit existing endpoints for missing `PermissionMiddleware` gates surfaced during that test pass.
4. Deliverable: a permissions matrix doc + automated test suite that becomes the Acceptance Criteria check for §6.

### Phase 1 — Academic Fees Structure completion (~1–1.5 weeks)
1. Migration: add `student_category` (ENUM/lookup: local/international, sponsored/self-sponsored) and `currency` (default RWF) columns to `fee_structures`; extend `fee_structure_departments`/`findBestMatch()` matching to consider category.
2. Extend `FeeController` create/update validation and list filters (program, level, student category, year — client explicitly asks for this filter combination).
3. Frontend: add Student Category and Currency to `FeeStructuresPage.tsx` create/edit forms and filter bar; add archive (soft-delete via `is_active`) action if not already exposed.
4. Reconcile the client's attached fee-structure reference document column-by-column against `fee_structures` schema before sign-off (explicit acceptance criterion from the request).

### Phase 2 — Student Directory (Finance View) (~1 week)
1. Migration: add guardian/next-of-kin contact columns to `student` (e.g. `guardian_name`, `guardian_phone`, `guardian_email`, `guardian_relationship`) if not sourced from an existing related table — confirm with Registrar whether this data is captured elsewhere (e.g. admissions application) before adding new columns.
2. New permission `VIEW_STUDENT_DIRECTORY_FINANCE` (read-only) gating a new route, reusing `StudentController::index()`'s existing filter logic rather than duplicating it.
3. Frontend: new `pages/finance/StudentDirectoryPage.tsx` reusing the Registrar list layout/columns, adding a fee/payment-status badge per row (join against `fee_invoices`/`student_fee_overrides` summary), linking to the existing student fee/payment detail view.
4. Confirm with Registrar whether Finance needs any edit rights (client flagged this as TBD) — resolve before building edit UI; default to read-only.

### Phase 3 — Payment Calendar (~1–1.5 weeks, can run parallel to Phase 4)
1. Migration: new `payment_calendar_events` table — `academic_year_id` (FK), `event_type` (registration_deadline/installment_due/penalty_start/semester_start/semester_end), `label`, `event_date`, `fee_structure_id` (nullable FK, for installment-specific dates), `is_active`.
2. Backend: `PaymentCalendarController` with CRUD for Finance/Admin, and a read-only endpoint for the student portal (if in scope — confirm student portal exists and is in scope before building that surface).
3. Frontend: `pages/finance/PaymentCalendarPage.tsx` (admin CRUD, calendar/list view), plus a read-only widget if student portal integration is confirmed.
4. Wire `fee_invoices.due_date` generation to optionally pull from configured calendar events rather than being fully ad hoc, so the calendar is the source of truth going forward (not just a display layer).

### Phase 4 — Budget Execution module (~2–2.5 weeks, largest single item)
1. Migration: extend `expense_budgets` with `department_id`/`cost_center_id` (FK to `departements`), add a `budget_periods` concept if monthly/quarterly tracking is required (confirm granularity against the client's attached Excel before building), and formalize a variance view (`planned_budget`, `amount_spent`, `balance` computed columns or a reporting query).
2. Backend: promote budget logic out of `FeeController`/`ExpensesPage` tab into a dedicated `BudgetController` with `listByYear`, `compare(yearA, yearB)`, `export(format=xlsx|pdf)` endpoints; overspend flag = `amount_spent > planned_budget`.
3. Frontend: new standalone `pages/finance/BudgetExecutionPage.tsx` (not an Expenses tab) with year-over-year comparison view and export buttons (reuse existing Excel/PDF export utilities already used elsewhere in Finance, e.g. invoice/receipt exports, for consistency).
4. Reconcile against the client's attached budget-execution Excel structurally before implementation sign-off (explicit acceptance criterion).

### Phase 5 — Postgraduate Fees — International Students (~1 week, depends on Phase 1 schema)
1. Migration: new `postgraduate_international_fee_structures` table, deliberately **separate** from `fee_structures` per the client's explicit instruction not to merge — mirrors Phase 1's schema plus `nationality_region`, `surcharge_type` (visa/insurance/other), `currency`.
2. Backend: parallel controller/model or extend `FeeController` with clearly namespaced methods (`listPgIntlStructures`, etc.) — avoid overloading `findBestMatch()` with cross-cutting conditionals.
3. Frontend: new `PostgraduateInternationalFeesPage.tsx`, distinct from `FeeStructuresPage.tsx`, per client's "distinct table/view" requirement.
4. Currency handling: at minimum, store amount + currency code and display as-is; confirm with Finance whether live FX conversion is actually required or whether fixed quoted rates per academic year are sufficient (significant scope difference — resolve before estimating further).

### Phase 6 — HR Verification & Sign-off (~3–4 days, can run throughout as QA)
1. End-to-end test pass: staff add/edit/view, payroll run + payslip generation, leave request/approve/reject, using the Phase 0 test accounts per role.
2. Confirm HR data returns 403 for Finance/Registrar accounts (covered by Phase 0 harness) and that no HR page/menu item leaks into non-HR/Admin sessions on the frontend.
3. Log and fix any broken actions found; this phase is expected to surface small bugs, not major gaps, given the module's existing completeness.

### Phase 7 — Acceptance & Sign-off
1. Run the full permissions matrix test suite from Phase 0 against the finished system.
2. Walk through each of the 5 Finance items live against the client's attached reference documents (Fees, Budget, Postgraduate/Intl Fees, Payment Calendar, Student Directory).
3. Obtain explicit client sign-off per the Acceptance Criteria listed in the request.

---

## 4. Open Questions for Client / Registrar / Finance (blocking items)

1. **Guardian/next-of-kin contact data** — is this already captured somewhere (e.g. admissions application form) that we should surface instead of adding new `student` columns?
2. **Finance edit rights on Student Directory** — read-only confirmed as default; does any workflow actually require Finance to edit student records?
3. **Budget Execution granularity** — annual only, or monthly/quarterly periods within a year? Determines Phase 4 scope significantly.
4. **International fee currency** — fixed quoted-rate display per year, or live FX conversion? Large scope delta.
5. **Student portal existence/scope** — does a student/parent portal currently exist for the Payment Calendar's read-only surface, or is that a future dependency?
6. **Attached reference documents** (fee structure doc, budget execution Excel, postgraduate international fee doc, payment calendar doc) referenced throughout the client's request were not included for this analysis — final column/field lists in Phases 1, 4, 5 must be reconciled against those source documents before implementation, not assumed from this report alone.

---

## 5. Rough Sequencing / Effort Summary

| Phase | Scope | Est. Effort | Dependency |
|---|---|---|---|
| 0 | RBAC hardening + test harness | 3–5 days | None — do first |
| 1 | Fees Structure completion | 1–1.5 weeks | Phase 0 |
| 2 | Student Directory (Finance) | 1 week | Phase 0 |
| 3 | Payment Calendar | 1–1.5 weeks | Phase 0 (parallel to 4) |
| 4 | Budget Execution | 2–2.5 weeks | Phase 0 (parallel to 3) |
| 5 | Postgraduate/International Fees | 1 week | Phase 1 |
| 6 | HR verification | 3–4 days | Phase 0 (can run throughout) |
| 7 | Acceptance & sign-off | 2–3 days | All above |

**Total estimated calendar time:** ~7–9 weeks with one full-stack developer working sequentially; ~5–6 weeks if Phases 2/3/4 are parallelized across two developers, given they touch mostly independent modules.

---

## 6. RBAC Audit (Phase 0)

`MIS_Fix_Request.pdf` (client's §6 Can View / Can Edit / Cannot Access matrix) is not present in this repo, so this audit works from the matrix as summarized in prose in §2.6/§4 above (Finance ⛔ HR salaries & registrar non-financial data; Registrar ⛔ budget & payroll; Admin/IT bypasses all). If the actual attached matrix differs in any cell, re-run this audit against it before Phase 0 sign-off.

### 6.1 Route gate coverage

Every route group in `backend/routes/api/finance.php`, `employees.php`, `payroll.php`, `leave.php`, and `students.php` already carries a `PermissionMiddleware` or `MaybePermissionMiddleware` gate — no ungated endpoint was found in any of the five files. The Cannot-Access requirements in the client's matrix are therefore enforced today by **role→permission assignment**, not by route wiring, and that's where this audit focused.

### 6.2 Negative-access verification (role_permissions grants)

**Correction (superseded the first pass of this section):** the original version of this audit grepped migration files line-by-line for cross-department grants and reported everything clean. That grep was too shallow — role grants are seeded via multi-line `INSERT ... SELECT ... WHERE r.name IN (...)` statements (see migration 094/028) where the role name and the granted slug never appear on the same matched line, so line-based grep silently missed real grants. §6.5 below replaces that static check with a live query + an automated HTTP regression suite, which found two real violations:

| Check | Result |
|---|---|
| `hr_manager` granted `VIEW_FINANCE` / `MANAGE_FINANCE`? | Not granted — clean |
| `finance_officer` granted `VIEW_HR_EMPLOYEES` / `MANAGE_HR_EMPLOYEES` / `VIEW_PAYROLL` / `MANAGE_PAYROLL`? | Not granted — clean |
| `registrar` granted `VIEW_PAYROLL` / `MANAGE_PAYROLL` / `VIEW_HR_EMPLOYEES` / `MANAGE_HR_EMPLOYEES`? | Not granted — clean |
| `registrar` granted `VIEW_FINANCE`? | **Granted — violation.** Lets Registrar read `/api/finance/*` (structures, billing, budgets, refunds, sponsors, reports) via `MaybePermissionMiddleware([VIEW_FINANCE, MANAGE_FINANCE, ...])` in `finance.php:51-56`. Directly contradicts "Registrar ⛔ budget." |
| `finance_officer` granted `VIEW_STUDENTS`? | **Granted — violation.** Lets Finance read the full `/api/students` registrar record (not the finance-scoped view `VIEW_STUDENT_DIRECTORY_FINANCE` was added for in §6.3/§6.4) via `PermissionMiddleware(VIEW_STUDENTS)` in `students.php:59`. Directly contradicts "Finance ⛔ registrar academic non-financial data." |

Confirmed against the live `curac_save` database (`role_permissions` joined to `roles`/`permissions`), not just migration history — this is real, current drift, not a hypothetical.

**Fixed:** `backend/database/migrations/2026_07_15_096_revoke_rbac_cross_department_grants.sql` deletes both grants (idempotent `DELETE ... JOIN`). Applied to the local dev DB and confirmed via §6.5 — suite now passes 15/15.

### 6.3 Permission slug vs. required slug

| Required capability (client matrix) | Existing slug | Status |
|---|---|---|
| Finance: view fee structures/billing/approvals/expenses/refunds/balance/clearance/reports | `VIEW_FINANCE`, `VIEW_FINANCE_*` (12 sub-slugs) | Covered |
| Finance: edit above | `MANAGE_FINANCE` | Covered |
| Finance: view budget execution (Phase 4, not built) | — | **Added:** `VIEW_BUDGET_EXECUTION` |
| Finance: edit budget execution | — | **Added:** `MANAGE_BUDGET_EXECUTION` |
| Finance: view/manage payment calendar (Phase 3, not built) | — | **Added:** `VIEW_PAYMENT_CALENDAR`, `MANAGE_PAYMENT_CALENDAR` |
| Finance: view student directory w/ fee status (Phase 2, not built) | — | **Added:** `VIEW_STUDENT_DIRECTORY_FINANCE` |
| Registrar: view/manage students | `VIEW_STUDENTS`, `MANAGE_STUDENTS` | Covered |
| HR: view/manage employees, payroll, leave | `VIEW_HR_EMPLOYEES`, `MANAGE_HR_EMPLOYEES`, `VIEW_PAYROLL`, `MANAGE_PAYROLL`, `VIEW_LEAVE_REQUESTS`, `MANAGE_LEAVE_REQUESTS` | Covered |
| Admin/IT: full access | `superadmin`/`admin` bypass in `PermissionMiddleware::handle()` | Covered (intentionally untouched) |

### 6.4 Changes made

- Added 5 slugs to `backend/app/Constants/Permissions.php` (and mirrored in `frontend/src/constants/permissions.ts` per the file's own "single source of truth" contract): `VIEW_BUDGET_EXECUTION`, `MANAGE_BUDGET_EXECUTION`, `VIEW_PAYMENT_CALENDAR`, `MANAGE_PAYMENT_CALENDAR`, `VIEW_STUDENT_DIRECTORY_FINANCE`.
- New migration `backend/database/migrations/2026_07_15_095_rbac_phase0_finance_slugs.sql` seeds these into `permissions` and grants them to `superadmin`/`admin`/`finance_officer` only (Registrar/HR excluded by omission, per the Cannot-Access column), following the idempotent `INSERT IGNORE` pattern from migration 094.
- No route files were changed — no missing gates were found to fix (see §6.1). These new slugs have no enforcement point yet because the Budget Execution/Payment Calendar/Student Directory-Finance endpoints don't exist until Phases 2–4 are built; wire `PermissionMiddleware` with these slugs into the new controllers/routes when those phases land.

### 6.5 Automated regression suite

`backend/scripts/rbac_regression_test.php` — no test framework existed in this repo (no `tests/` directory, no PHPUnit dependency), so this follows the existing convention of standalone CLI scripts under `backend/scripts/` (e.g. `seed_permissions.php`).

**What it does:** provisions one dedicated, idempotent test account per role (`qa_rbac_finance@test.local`, `qa_rbac_registrar@test.local`, `qa_rbac_hr@test.local`, `qa_rbac_admin@test.local` — these are the "Phase 0 test accounts per role" Phase 6 refers to), logs each one in through the real HTTP API (login → OTP verify → bearer token — reading the OTP from `dev_otp` when `APP_DEBUG=true`, or straight from `users.otp_code` otherwise, since the script shares the app's DB connection), then calls real endpoints with that token and asserts the status code the Cannot-Access/Can-View matrix requires.

**Run it:** `php backend/scripts/rbac_regression_test.php [base_url]` (defaults to `APP_URL` from `.env`; pass a base URL explicitly to point at a different environment, e.g. a `php -S` dev server). Exit code 0 = all assertions passed, 1 = at least one failed — usable as a CI gate per Phase 7's "run the full permissions matrix test suite" step.

**Last run** (2026-07-15, against the local dev DB via a temporary `php -S` server since Apache wasn't running):

| Role | Endpoint | Expected | Actual | Result | Requirement |
|---|---|---|---|---|---|
| finance_officer | GET /api/finance/structures | 200 | 200 | PASS | Can-View: Finance own module |
| registrar | GET /api/students | 200 | 200 | PASS | Can-View: Registrar own module |
| hr_manager | GET /api/employees | 200 | 200 | PASS | Can-View: HR own module |
| hr_manager | GET /api/hr/payroll | 200 | 200 | PASS | Can-View: HR own module |
| admin | GET /api/finance/structures | 200 | 200 | PASS | Can-View: Admin bypass |
| admin | GET /api/employees | 200 | 200 | PASS | Can-View: Admin bypass |
| admin | GET /api/hr/payroll | 200 | 200 | PASS | Can-View: Admin bypass |
| admin | GET /api/students | 200 | 200 | PASS | Can-View: Admin bypass |
| finance_officer | GET /api/hr/payroll | 403 | 403 | PASS | Cannot-Access: Finance ⛔ HR salaries |
| finance_officer | GET /api/employees | 403 | 403 | PASS | Cannot-Access: Finance ⛔ HR data |
| finance_officer | GET /api/students | 403 | **200** | **FAIL** | Cannot-Access: Finance ⛔ registrar academic data — matches §6.2 finding |
| registrar | GET /api/finance/structures | 403 | **200** | **FAIL** | Cannot-Access: Registrar ⛔ budget/finance — matches §6.2 finding |
| registrar | GET /api/finance/budgets | 403 | **422** | **FAIL** | Cannot-Access: Registrar ⛔ budget. Not 403 either way — 422 means the request got *past* `PermissionMiddleware` and failed controller-level validation (missing query params), which itself proves the permission gate didn't block it. Same root cause as the row above. |
| registrar | GET /api/hr/payroll | 403 | 403 | PASS | Cannot-Access: Registrar ⛔ payroll |
| registrar | GET /api/employees | 403 | 403 | PASS | Cannot-Access: Registrar ⛔ HR data |

**15 assertions, 12 passed, 3 failed** on first run. The 3 failures were one underlying cause each (the two over-grants in §6.2), not independent bugs. After applying migration 096 (see §6.2) and re-running against the same live DB: **15 assertions, 15 passed, 0 failed.** Phase 0 RBAC hardening is now verified clean for the four roles and endpoints in this matrix — re-run this suite after every later phase per Phase 6/7's own instructions.

Housekeeping: this suite was run locally via a temporary `php -S 127.0.0.1:8899 backend/public/router.php` dev server (kept in the repo — harmless, ignored by real Apache/MAMP deployments which use `.htaccess` instead) since Apache wasn't running in this environment. The 4 `qa_rbac_*@test.local` accounts it provisions are left in the dev database intentionally — the script is idempotent and re-provisions/re-uses them on every run.
