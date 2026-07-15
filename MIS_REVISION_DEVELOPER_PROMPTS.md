# MIS Revision Request — Developer Prompts by Phase

Companion to [MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md](MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md).

Each phase below is split into role-scoped prompts (Backend, Frontend, QA/Tester) meant to be pasted directly into a Claude Code session for that developer. Backend and Frontend prompts for the same phase can run in parallel once the backend prompt has landed its migration + routes (frontend needs the API contract). The QA prompt always runs **after** both are merged, on the `emmy` branch, before moving to the next phase.

General rules embedded in every prompt (stated once here, not repeated per prompt):
- Work on the `emmy` branch; never commit to `main` directly.
- New migrations go in `backend/database/migrations/` only, next sequential `YYYY_MM_DD_NNN_description.sql`, idempotent (guard with `INFORMATION_SCHEMA` checks / `IF NOT EXISTS` / `INSERT IGNORE`) — never edit an already-applied migration file.
- Mirror any new permission slug in both `backend/app/Constants/Permissions.php` and `frontend/src/constants/permissions.ts`.
- Gate every new backend route with `PermissionMiddleware` and every new frontend route/menu item with `ProtectedRoute`.
- Do not invent columns/fields beyond what's specified — flag ambiguity back to the analyst/PM rather than guessing.

---

## Phase 0 — RBAC Hardening & Test Harness

### Prompt: Backend Developer — DONE, kept for reference
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md sections 2.6 and Phase 0. We're hardening RBAC before building the new Finance/HR features requested in MIS_Fix_Request.pdf's section 6 permissions matrix.

Task:
1. Read backend/app/Constants/Permissions.php and backend/app/Middleware/PermissionMiddleware.php to understand the current permission model.
2. Cross-reference the client's Can View / Can Edit / Cannot Access matrix (Finance / Registrar / HR / Admin) against the current permission catalog. Produce a short markdown table (add it to the bottom of MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md under a new "RBAC Audit" section) listing: existing permission slug (if any) vs. required slug, and which routes currently lack a PermissionMiddleware gate that should have one.
3. Add any missing permission slugs to Permissions.php following the existing naming convention, with a new migration seeding them into the permissions table (follow the pattern in backend/database/migrations/2026_07_09_094_complete_permissions_catalog.sql).
4. Audit routes in backend/routes/api/finance.php, employees.php, payroll.php, leave.php, students.php for any endpoint missing a PermissionMiddleware gate that exposes HR salary data, budget data, or student financial data to the wrong role — fix the gates.
5. Do not touch superadmin/admin bypass behavior — that's intentional per the client's Admin/IT row.

Report back which slugs you added and which routes you re-gated, with file:line references.
```

**Result (see plan §6 for full detail):** `MIS_Fix_Request.pdf` was not in the repo, so the audit worked from the matrix as summarized in prose in §2.6/§4 — re-run against the real PDF if it differs. All 5 route files already had full `PermissionMiddleware`/`MaybePermissionMiddleware` coverage (no gates were missing — §6.1), so the Cannot-Access requirements live entirely in `role_permissions` grants, not route wiring. 5 new slugs were added for not-yet-built Phase 2-4 Finance modules (`VIEW_BUDGET_EXECUTION`, `MANAGE_BUDGET_EXECUTION`, `VIEW_PAYMENT_CALENDAR`, `MANAGE_PAYMENT_CALENDAR`, `VIEW_STUDENT_DIRECTORY_FINANCE` — migration 095). A first pass of the negative-access check (line-by-line grep of migration files) reported everything clean, but that was too shallow to catch multi-line grant statements — the QA pass below re-verified against the live database and found 2 real over-grants, fixed by migration 096. If re-running this kind of audit in the future, verify against a live `role_permissions` query, not just migration-file grep.

### Prompt: QA/Tester (after Phase 0 merges) — DONE, kept for reference / re-run instructions
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md Phase 0 and the "RBAC Audit" section (§6) added by the backend developer.

This suite already exists: backend/scripts/rbac_regression_test.php. No test framework or tests/ directory existed in this repo (no PHPUnit), so it was built as a standalone CLI script following this repo's existing backend/scripts/ convention (e.g. seed_permissions.php), not as a new PHPUnit suite — confirmed with the user before building it.

What it does: provisions 4 idempotent "Phase 0 test accounts" (qa_rbac_finance@test.local, qa_rbac_registrar@test.local, qa_rbac_hr@test.local, qa_rbac_admin@test.local — referenced by that name in Phase 6), logs each in through the real HTTP API (login → OTP verify, reading dev_otp when APP_DEBUG=true or users.otp_code otherwise), then asserts the client's Can-View (200) / Cannot-Access (403) matrix against real endpoints with the resulting bearer token.

Run it: `php backend/scripts/rbac_regression_test.php [base_url]` (defaults to APP_URL from .env). Exit code 0 = all passed, 1 = at least one failed.

First run found 2 real cross-department over-grants in the live role_permissions table (registrar had VIEW_FINANCE, finance_officer had VIEW_STUDENTS — see §6.2) — not hypothetical, confirmed via live DB query and 3 failing HTTP assertions. Migration 2026_07_15_096_revoke_rbac_cross_department_grants.sql fixed both; suite now passes 15/15 (see §6.5 for the full before/after table).

For every later phase: re-run this same script (no changes needed unless a phase adds new roles/endpoints to the matrix — extend the `$matrix` array at the top of the file in that case) and report pass/fail with specifics, not just "tests passed."
```

---

## Phase 1 — Academic Fees Structure Completion

### Prompt: Backend Developer
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md section 2.1 and Phase 1, and MIS_Fix_Request.pdf section 1 (the fee structure column table and bullet points).

Task:
1. Read backend/app/Models/FeeStructureModel.php and backend/app/Controllers/FeeController.php (the create/update handlers, roughly lines 139-190) to understand current fee_structures schema and matching logic (findBestMatch).
2. Add a new migration in backend/database/migrations/ that adds `student_category` (nullable lookup: local/international, sponsored/self-sponsored — reuse the existing `student.category` values if they already cover this, check backend/database/migrations/2026_04_27_027_comprehensive_schema.sql for the student table's category column values before inventing new ones) and `currency` (VARCHAR(10) NOT NULL DEFAULT 'RWF') columns on fee_structures.
3. Update FeeStructureModel::findBestMatch() to factor in student_category when resolving which fee structure applies to a student.
4. Update FeeController's create/update validation to accept and validate the new fields.
5. Extend the list/filter endpoint to support filtering by student_category alongside the existing program/level/year filters.
6. Do NOT touch payment_plan/installment_count semantics — Payment Calendar (Phase 3) will build on top of these, not replace them.

Report the migration filename, the new columns, and confirm findBestMatch's updated resolution order.
```

### Prompt: Frontend Developer
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md section 2.1 and Phase 1. The backend has (or will shortly have) added `student_category` and `currency` fields to fee_structures with a corresponding filter param — confirm the exact field names and API contract with the backend developer or by reading backend/app/Controllers/FeeController.php before starting.

Task:
1. Read frontend/src/pages/finance/FeeStructuresPage.tsx and frontend/src/pages/finance/FeeTypesPage.tsx.
2. Add Student Category and Currency fields to the create/edit form (dropdown for category matching backend enum values, text/select for currency defaulting to RWF).
3. Add Student Category to the filter bar alongside existing program/level/year filters.
4. Confirm an archive action exists (soft-delete via is_active) on the list view; if missing, add it.
5. Verify the page still renders and the create/edit/filter flow works end-to-end against the local dev backend before reporting done — start the dev server and click through it, don't just typecheck.

Report what you changed and confirm you tested the live create/edit/filter flow in a browser.
```

### Prompt: QA/Tester (after Phase 1 merges)
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md Phase 1 and MIS_Fix_Request.pdf section 1's column table.

Task:
1. Re-run the Phase 0 RBAC regression suite — confirm no new fee-structure endpoints leak across roles.
2. Manually verify, via the running app, that every column in MIS_Fix_Request.pdf section 1's table (Fee Category, Program/Faculty, Study Level, Academic Year, Student Category, Amount, Payment Terms, Status) is present and editable in the Fee Structures UI.
3. Test create, edit, and archive of a fee item scoped to a specific program/level/year, and confirm Finance can filter/search by program, study level, student category, and year as required.
4. Report pass/fail per column and per bullet point from the client's request, not a generic summary.
```

---

## Phase 2 — Student Directory (Finance View)

### Prompt: Backend Developer
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md section 2.2 and Phase 2, and MIS_Fix_Request.pdf section 2.

Before writing any migration: this phase has an open question (see the plan's "Open Questions" section, item 1) — whether guardian/next-of-kin contact data already exists elsewhere (e.g. an admissions application table) before adding new columns to `student`. Check backend/database/migrations/ for any existing guardian/next-of-kin/emergency-contact columns on student or student_applications tables first, and report what you find before proceeding — do not add duplicate columns.

Task:
1. If no guardian contact data exists anywhere, add a migration with `guardian_name`, `guardian_phone`, `guardian_email`, `guardian_relationship` nullable columns on the `student` table.
2. Add a new permission slug VIEW_STUDENT_DIRECTORY_FINANCE (read-only) to Permissions.php + its seeding migration.
3. Add a new route (e.g. GET /api/finance/students) gated by the new permission, reusing StudentController::index()'s existing filter logic (backend/app/Controllers/StudentController.php, applyFilterableClauses around line 2215) rather than duplicating it — either call the same method from a thin new controller action or add a route alias.
4. Extend the response to include a fee/payment status summary per student (join against fee_invoices / student_fee_overrides) so Finance can see balance status without a second request.
5. Keep this strictly read-only — do not add any write/update endpoint for this route unless explicitly told the "business reason" from the plan's open question 2 has been resolved.

Report the new route, permission slug, and whether guardian columns were newly added or already existed.
```

### Prompt: Frontend Developer
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md section 2.2 and Phase 2. Confirm the new GET /api/finance/students endpoint and VIEW_STUDENT_DIRECTORY_FINANCE permission slug with the backend developer before starting.

Task:
1. Read frontend/src/pages/StudentsPage.tsx (the Registrar's existing student list) to reuse its layout/columns/filters as closely as possible.
2. Create frontend/src/pages/finance/StudentDirectoryPage.tsx: same searchable/filterable list layout, phone/email/guardian contact columns, and a fee/payment status badge per row linking to the existing student fee/payment detail view.
3. Register the route in App.tsx gated by VIEW_STUDENT_DIRECTORY_FINANCE via ProtectedRoute, and add it to the Finance sidebar/menu.
4. Make every field on this page read-only (no edit affordances) per the plan's default decision.
5. Start the dev server, log in as a finance_officer test account, and click through search/filter/link-to-payment-status before reporting done.

Report what you built and confirm you tested it live as a finance_officer account, not just as admin.
```

### Prompt: QA/Tester (after Phase 2 merges)
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md Phase 2 and MIS_Fix_Request.pdf section 2.

Task:
1. Re-run the Phase 0 RBAC regression suite, specifically confirming: Finance can view the new student directory; Finance CANNOT edit any student record through it; a registrar or HR account gets 403 on the finance-scoped route if it's meant to be finance-only (confirm intended scope with the plan before asserting this).
2. Verify the directory shows phone, email, and guardian/next-of-kin contact where available, and that each row links correctly to that student's fee/payment status.
3. Report pass/fail per bullet in MIS_Fix_Request.pdf section 2.
```

---

## Phase 3 — Payment Calendar

### Prompt: Backend Developer
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md section 2.5 and Phase 3, and MIS_Fix_Request.pdf section 5. This is a build-from-scratch feature — grep the codebase first to confirm nothing named payment_calendar/installment_schedule already exists (the analysis found none, but re-verify since Phase 1/2 may have landed changes since).

Task:
1. Add a migration creating `payment_calendar_events`: id, academic_year_id (FK academic_years.id), event_type ENUM('registration_deadline','installment_due','penalty_start','semester_start','semester_end'), label, event_date, fee_structure_id (nullable FK fee_structures.id, for installment-specific dates), is_active, created_by, timestamps.
2. Create PaymentCalendarController with CRUD endpoints gated by a new VIEW_PAYMENT_CALENDAR / MANAGE_PAYMENT_CALENDAR permission pair (seed both, admin/finance get manage, everyone with view access gets read).
3. Add a read-only endpoint variant if a student/parent portal exists in this codebase — grep for an existing student-portal route group before building; if none exists, skip this and note it as out of scope (per the plan's open question 5).
4. Optionally (confirm scope first with whoever owns Phase 1 if it already merged): wire fee_invoices.due_date generation to pull from configured calendar events when a matching event exists, instead of being purely ad hoc.

Report the migration, endpoints, and whether a student portal was found (and thus whether you built the read-only student-facing variant).
```

### Prompt: Frontend Developer
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md section 2.5 and Phase 3. Confirm the PaymentCalendarController's endpoints and permission slugs with the backend developer before starting.

Task:
1. Build frontend/src/pages/finance/PaymentCalendarPage.tsx: admin/finance CRUD for calendar events, filterable by academic year, showing registration deadlines, installment due dates, penalty start dates, and semester start/end in a clear calendar or grouped-list view.
2. Register the route gated by VIEW_PAYMENT_CALENDAR / MANAGE_PAYMENT_CALENDAR via ProtectedRoute.
3. Confirm the calendar is configurable per academic year entirely through this UI — no hardcoded dates, no code changes needed to add a new year's schedule.
4. If the backend built a student-portal read-only variant, add the corresponding read-only widget/page there too; if not, skip.
5. Start the dev server and test creating a full year's calendar (all 5 event types) and switching between academic years before reporting done.

Report what you built and confirm live testing across at least two academic years.
```

### Prompt: QA/Tester (after Phase 3 merges)
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md Phase 3 and MIS_Fix_Request.pdf section 5.

Task:
1. Re-run the Phase 0 RBAC regression suite.
2. Verify all 5 event types display correctly, the calendar is configurable per academic year without any code change, and (if built) the read-only student/parent view actually is read-only.
3. If fee_invoices.due_date was wired to calendar events, spot-check that generating an invoice against a fee structure with a configured installment schedule produces due dates matching the calendar.
4. Report pass/fail per bullet in MIS_Fix_Request.pdf section 5.
```

---

## Phase 4 — Budget Execution Module

### Prompt: Backend Developer
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md section 2.3 and Phase 4, and MIS_Fix_Request.pdf section 3. This is the largest single item in the request.

Before starting: the plan flags an open question (budget granularity — annual only vs. monthly/quarterly). Confirm this against the client's attached budget-execution Excel (ask the PM/analyst for it if not available) before designing the schema — this materially changes the migration.

Task:
1. Read backend/app/Models/ExpenseBudgetModel.php and the budgets tab logic currently embedded in frontend/src/pages/finance/ExpensesPage.tsx to understand what exists (expense_budgets: academic_year_id, category_id, amount, vs SUM(expenses.amount) for actual).
2. Add a migration extending expense_budgets with department_id/cost_center_id (FK to departements), and — only if the granularity question resolves to sub-annual — a budget_periods concept.
3. Create a dedicated BudgetController (do not keep piling onto FeeController) with: listByYear(year), compare(yearA, yearB), export(format=xlsx|pdf). Variance = amount_spent - planned_budget; overspend flag = amount_spent > planned_budget.
4. Gate all endpoints with a new MANAGE_BUDGET / VIEW_BUDGET permission pair per the client's RBAC matrix (Finance can view+edit budgets; Registrar/HR cannot access).
5. For export, check whether an existing Excel/PDF export utility is already used elsewhere in Finance (e.g. invoice/receipt exports) and reuse it rather than adding a new dependency.

Report the migration, new controller's endpoints, and which export utility you reused (or why none was reusable).
```

### Prompt: Frontend Developer
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md section 2.3 and Phase 4. Confirm BudgetController's finalized endpoints with the backend developer before starting — this phase depends heavily on the resolved granularity question.

Task:
1. Build a standalone frontend/src/pages/finance/BudgetExecutionPage.tsx (do not keep it as an ExpensesPage tab) with: line items per department/cost center showing Planned Budget, Amount Spent, Balance columns; a year-over-year comparison view; visual overspend flags; Excel/PDF export buttons.
2. Register the route gated by VIEW_BUDGET via ProtectedRoute, MANAGE_BUDGET-gated edit actions.
3. Migrate/remove the old budgets tab from ExpensesPage.tsx once the standalone page is confirmed working, so there isn't a duplicate/stale UI left behind.
4. Start the dev server, create budget line items for at least two departments across two academic years, and confirm the comparison view and export both work before reporting done.

Report what you built, confirm the old ExpensesPage tab was cleanly removed, and confirm live testing of export and year comparison.
```

### Prompt: QA/Tester (after Phase 4 merges)
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md Phase 4 and MIS_Fix_Request.pdf section 3.

Task:
1. Re-run the Phase 0 RBAC regression suite — specifically confirm Registrar and HR accounts get 403 on all budget endpoints.
2. Verify line items per department/cost center display Planned/Spent/Balance correctly, variance auto-calculates, overspending is flagged, year-over-year comparison works, and both Excel and PDF export produce correct, openable files.
3. Reconcile the delivered structure against the client's attached budget-execution Excel column-by-column (this was an explicit acceptance criterion in the plan) — report any structural mismatch.
4. Report pass/fail per bullet in MIS_Fix_Request.pdf section 3.
```

---

## Phase 5 — Postgraduate Fees (International Students)

### Prompt: Backend Developer
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md section 2.4 and Phase 5, and MIS_Fix_Request.pdf section 4. This depends on Phase 1's fee_structures schema being finalized (student_category, currency columns) — confirm Phase 1 has merged before starting.

Task:
1. Add a migration creating postgraduate_international_fee_structures as a table deliberately SEPARATE from fee_structures (the client explicitly said not to merge them) — mirror fee_structures' columns (academic_year_id, department_id, level_id, fee_type, label, amount, semester, payment_plan, installment_count, is_active) plus nationality_region, surcharge_type (visa/insurance/other/none), currency.
2. Confirm with Finance (open question in the plan, item 4) whether currency handling means fixed quoted rates per academic year (simple: store amount+currency, display as-is) or live FX conversion (complex: needs a rate table/service) — default to fixed quoted rates unless told otherwise, and flag this assumption explicitly in your report.
3. Add model + controller methods clearly namespaced (e.g. listPgIntlStructures, createPgIntlStructure) — do not overload FeeStructureModel::findBestMatch() with cross-cutting conditionals for this.
4. Reuse existing departements.program_level = 'postgraduate' and student.nationality/country data (already present) to drive filtering rather than duplicating that data.
5. Gate endpoints with the same finance permission set used for regular fee structures, since this is still a Finance-owned fee type.

Report the migration, new table name, and which currency-handling assumption you went with.
```

### Prompt: Frontend Developer
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md section 2.4 and Phase 5. Confirm the postgraduate/international fee endpoints with the backend developer before starting.

Task:
1. Build frontend/src/pages/finance/PostgraduateInternationalFeesPage.tsx, distinct from FeeStructuresPage.tsx per the client's explicit "distinct table/view, not merged" requirement — do not add a tab/filter toggle on the existing page instead.
2. Include nationality/region category, surcharge type, and currency fields in the create/edit form.
3. Register the route under the same Finance permission set as regular fee structures.
4. Start the dev server, create a postgraduate international fee entry, and confirm it does not appear in or interfere with the regular FeeStructuresPage list before reporting done.

Report what you built and confirm the two fee-structure views are cleanly separate in the UI.
```

### Prompt: QA/Tester (after Phase 5 merges)
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md Phase 5 and MIS_Fix_Request.pdf section 4.

Task:
1. Re-run the Phase 0 RBAC regression suite.
2. Confirm the postgraduate/international fee structure is genuinely a separate table/view from the local/undergraduate one (query the DB directly to confirm no merge happened), that nationality/region and surcharge fields work, and currency displays correctly.
3. Report pass/fail per bullet in MIS_Fix_Request.pdf section 4, and explicitly flag the currency-handling assumption (fixed vs. live FX) made in Phase 5 backend work for client confirmation.
```

---

## Phase 6 — HR Verification & Sign-off

### Prompt: QA/Tester (this phase is verification-only, no new backend/frontend prompt needed)
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md section 2.7 and Phase 6, and MIS_Fix_Request.pdf section 7. The HR module (backend/app/Controllers/HrEmployeeController.php, HrPayrollController.php, LeaveController.php) is already functionally complete per the codebase survey — this phase is an end-to-end verification pass, not new development.

Task:
1. Using the Phase 0 test accounts, log in as hr_manager and walk through: staff record add/edit/view (frontend/src/pages/hr/StaffListPage.tsx, StaffDetailPage.tsx); a full payroll run including copy-period, payslip generation, and status workflow (PayrollPage.tsx, PayrollSlipPage.tsx); leave request submission, approval, and rejection (LeavePage.tsx, MyLeavePage.tsx).
2. Confirm every action completes without error and produces the expected data change.
3. Re-run the Phase 0 RBAC regression suite specifically for HR: confirm Finance and Registrar accounts get 403 on all HR salary/payroll endpoints, and that no HR menu item appears in their frontend navigation.
4. If any broken action is found, file it as a specific bug (endpoint, request, expected vs actual response) rather than a general "HR needs work" note — this module is expected to need minor fixes only, not a rebuild.

Report pass/fail per bullet in MIS_Fix_Request.pdf section 7.
```

---

## Phase 7 — Final Acceptance & Sign-off

### Prompt: QA/Tester (final gate)
```
Read MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md Phase 7 and the full MIS_Fix_Request.pdf, plus all per-phase QA reports produced in Phases 0-6.

Task:
1. Re-run the full Phase 0 RBAC regression suite one final time against the complete, merged system.
2. Walk through each of the 5 Finance items (Fees Structure, Student Directory, Budget Execution, Postgraduate/International Fees, Payment Calendar) live, cross-checking against the client's attached reference documents (fee structure doc, budget execution Excel, postgraduate international fee doc, payment calendar doc) — if these were not actually provided during implementation, flag that explicitly rather than assuming compliance.
3. Confirm the client's Acceptance Criteria verbatim: all five Finance items live and matching reference docs; role-based permissions verified by logging in as each department; HR module fully functional with no broken actions.
4. Produce a final sign-off report: one row per Acceptance Criteria bullet, pass/fail, with evidence (screenshots, request/response logs, or specific test results) for each.
```
