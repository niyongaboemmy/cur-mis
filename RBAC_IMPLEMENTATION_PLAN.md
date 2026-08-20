# RBAC Hardening — Implementation Plan

Companion to [RBAC_PERMISSIONS_AUDIT.md](RBAC_PERMISSIONS_AUDIT.md). This plan turns each audit finding into concrete, ordered engineering work. Phases are independent enough to ship as separate PRs; do them in order since later phases assume the schema change in Phase 1.

---

## Phase 1 — Fix Finding A: role-name bypass → `is_system` flag (Critical)

**Migration:** [`backend/database/migrations/2026_07_16_103_rbac_hardening_is_system_and_grants.sql`](backend/database/migrations/2026_07_16_103_rbac_hardening_is_system_and_grants.sql) *(already created, ready to run)*

- Adds `roles.is_system TINYINT(1) DEFAULT 0`.
- Flags the 8 canonical roles (`superadmin`, `admin`, `registrar`, `hr_manager`, `lecturer`, `finance_officer`, `applicant`, `student`) as `is_system = 1`.
- Purely additive — safe to run on production, no data loss.

### Code changes required after the migration runs

1. **`backend/app/Controllers/RoleController.php`**
   - `create()` (line 49): reject any submitted `name` that collides case-insensitively with `superadmin`/`admin` (or any existing `is_system` role name) — return 409.
   - `update()` (line 75): if `$role['is_system'] === 1`, reject rename (`name` change) with 403. Still allow `description`/`enforce_campus_scope` edits.
   - `destroy()` (line 112): if `$role['is_system'] === 1`, reject with 403 (removes the "Cannot delete Superadmin easily... but for now standard delete" gap).
   - `RoleModel::find()` / `getWithUserCounts()` should surface `is_system` so the frontend can grey out rename/delete controls.

2. **`backend/app/Middleware/PermissionMiddleware.php`** and **`MaybePermissionMiddleware.php`**
   - Replace `in_array($user['role'], ['superadmin', 'admin'], true)` with a check against a `role_is_system` + `role_name === 'superadmin'` combination, OR simplest: keep the bypass **only** for `superadmin` (drop `admin` from the hardcoded bypass entirely) and instead have the `admin` role's actual bypass come from it genuinely holding every permission except `MANAGE_ROLES`/`MANAGE_PERMISSIONS` in `role_permissions` — which the seed already does. This removes the need for a name-string special case for `admin` at all.
   - Centralize whatever check remains into a single static helper (e.g. `AuthService::isSuperadmin($user)`) so the logic isn't duplicated across 8+ files.

3. **Duplicate bypass call sites to update to the same centralized helper:**
   `AcademicAnalyticsController.php:40`, `ApplicationAdminController.php:31`, `AttendanceController.php:58`, `ModuleMarksController.php:53`, `ForumController.php:494`, `MessageController.php:57,62,581`, `SearchController.php:42`.

4. **Frontend:** `ProtectedRoute.tsx:45`, `HasPermission.tsx:15`, `MainLayout.tsx:992` — same change, centralize into one `isSuperadmin(user)` util in e.g. `src/utils/permissions.ts`, and drop `admin` from the hardcoded list for the same reason as #2.

**Acceptance test:** create a role named `admin` via `POST /api/roles` with only `MANAGE_ROLES` granted to the actor's role → expect `409`. Attempt to rename/delete the seeded `superadmin` role → expect `403`.

---

## Phase 2 — Close Finding B: finance permission granularity gap

**Migration:** already included in `2026_07_16_103_...sql` §2 — grants all `VIEW_FINANCE_*` sub-slugs to any role currently holding `VIEW_FINANCE`/`MANAGE_FINANCE`, so no one is locked out once enforcement tightens.

### Code changes
- `backend/routes/api/finance.php:59-64` — split the single `MaybePermissionMiddleware([VIEW_FINANCE, MANAGE_FINANCE, VIEW_MOBILE_PAYMENTS, VIEW_ONLINE_PAYMENTS_HISTORY])` read group into per-route-group middleware matching what `FinanceHub.tsx` already checks on the frontend:
  - `/structures*` → `+VIEW_FINANCE_STRUCTURES`
  - `/billing/*` → `+VIEW_FINANCE_BILLING`
  - `/bursaries` → `+VIEW_FINANCE_BURSARIES`
  - `/sponsors` → `+VIEW_FINANCE_SPONSORS`
  - `/expenses*` → `+VIEW_FINANCE_EXPENSES`
  - `/refunds` → `+VIEW_FINANCE_REFUNDS`
  - `/balance` → `+VIEW_FINANCE_BALANCE`
  - `/clearance*` → `+VIEW_FINANCE_CLEARANCE`
  - `/reports/*` → `+VIEW_FINANCE_REPORTS`
  - `/summary` (top-level dashboard) → `+VIEW_FINANCE_OVERVIEW`
  - Keep `VIEW_FINANCE`/`MANAGE_FINANCE` as an **additional OR option** in every group (not a replacement) so existing superadmin/admin/full-finance roles keep working unchanged.

**Acceptance test:** a role with only `VIEW_FINANCE_BILLING` granted can load the Billing tab and hit `GET /api/finance/billing/summary`, but gets 403 on `/api/finance/refunds`.

---

## Phase 3 — Wire up remaining dead permission slugs

For each of the following, either enforce it in code or remove it from the catalog — do not leave declared-but-unused permissions:

| Slug | Decision | Action |
|---|---|---|
| `VIEW_EXAMS` | Enforce | Add to `routes/api/grades.php` read group (currently ungated or gated only by `MANAGE_EXAMS`) |
| `VIEW_TIMETABLE` / `MANAGE_TIMETABLE` | Enforce (if timetable feature exists) or remove | Confirm whether a timetable module/page actually exists in `frontend/src/pages`; if not built yet, remove the slug and its migration references, or leave as a documented "reserved for future module" (same pattern as migration 095's Phase-0 comment) |
| `VIEW_CLEARANCE` / `MANAGE_CLEARANCE` | Enforce | Gate `routes/api/finance.php` `/clearance*` group with these instead of/alongside `VIEW_FINANCE` |
| `VIEW_SETTINGS` | Enforce | Gate the read side of `routes/api/settings.php` (if such a route file exists) or fold into `VIEW_SYSTEM_BASICS` |
| `MANAGE_MESSAGES` / `BROADCAST_MESSAGES` | Already granted (migration 094) but never checked by any route | Add `MaybePermissionMiddleware` to the broadcast-audience endpoints in `routes/api/messages.php`, replacing the current ad hoc role-name checks in `MessageController.php:57,62,581` |
| `MANAGE_MERIT_LIST` / `VIEW_MERIT_LIST` | Enforce | Gate merit-list generation/view endpoints in `routes/api/applications.php` |
| `MANAGE_OWN_PROFILE` | Enforce | Gate the applicant self-service profile-update endpoint in `routes/api/applicant.php` (currently relies only on `ApplicantMiddleware`'s role check) |

**Rule of thumb going forward:** a permission constant should never be added to `Permissions.php` without, in the same PR, either a route middleware reference or a frontend gate reference — otherwise it silently rots (this is exactly how the 17 dead slugs accumulated).

---

## Phase 4 — Consolidate frontend permission-gating pattern

- `HasPermission.tsx` exists but has zero call sites; ~20 pages instead do inline `user?.permissions.includes(...)` checks with no shared helper and (unlike `ProtectedRoute`) without the superadmin bypass.
- Refactor `HasPermission.tsx` into the single reusable gate (component + a `usePermission(slug)` / `useAnyPermission(slugs[])` hook built on the centralized `isSuperadmin()` util from Phase 1), then migrate the ad hoc checks in:
  `StaffListPage.tsx`, `StudentDetailsPage.tsx`, `PermissionsManagementPage.tsx`, `RolesManagementPage.tsx`, `GraduandManagementPage.tsx`, `DeliberationPage.tsx`, `BudgetExecutionPage.tsx`, `FinanceHub.tsx`, `ForumsPage.tsx`, `AppraisalPage.tsx`, `LeavePage.tsx`, `PaymentsPage.tsx`, `PayrollPage.tsx`, `PayrollSlipPage.tsx`, `ModulesHub.tsx`, `ModulesMarksPage.tsx`, `EntityCrudTabs.tsx`, `CampusFilterSwitcher.tsx`, `GlobalSearch.tsx`, `UserDropdown.tsx`, `GradingScalePage.tsx`, `AnnouncementsPage.tsx`, `WelcomePage.tsx`, `AttendancePage.tsx`.
- This is a mechanical, low-risk refactor — no behavior change except fixing the superadmin-bypass inconsistency called out in the audit.

---

## Phase 5 — Frontend route-gate consistency (low priority, UX only)

Add `requiredPermissions` to the `ProtectedRoute` wrapping `/messages`, `/announcements`, `/forums` in `App.tsx:168-171` to match what the sidebar already hides them behind (`SEND_MESSAGES`/`VIEW_ANNOUNCEMENTS`/`VIEW_FORUMS`). Backend already enforces correctly either way — this only prevents a confusing "page loads but sidebar item was hidden" experience for direct-URL navigation.

---

## Phase 6 — Testing & rollout

1. Run the Phase 1 migration against a staging DB copy first; verify `roles.is_system` values with:
   ```sql
   SELECT name, is_system FROM roles;
   ```
2. Regression-test login/`/auth/me` for all 8 seeded roles — confirm `permissions[]` payload is unchanged in shape.
3. Manually verify the Phase 1 acceptance tests (create/rename/delete role attempts).
4. Manually verify the Phase 2 acceptance test (granular finance permission).
5. Full click-through of every sidebar module as `admin` (not `superadmin`) to confirm the seed's "everything except role/permission management" intent now actually holds once the code-level bypass is narrowed in Phase 1.
6. Deploy order: run SQL migration → deploy backend → deploy frontend (backend must tolerate old frontend briefly; since this migration is purely additive/permissive, no ordering hazard exists).

---

## Summary of Deliverables

- [x] `backend/database/migrations/2026_07_16_103_rbac_hardening_is_system_and_grants.sql` — schema + grant migration (created, not yet run)
- [ ] `RoleController.php` — protect `is_system` roles from rename/delete/name-collision (Phase 1)
- [ ] Centralized `isSuperadmin()` helper, backend (`AuthService`) + frontend (`utils/permissions.ts`), replacing 12+ duplicated string checks (Phase 1)
- [ ] `routes/api/finance.php` — granular permission checks per sub-route (Phase 2)
- [ ] Wire up or retire 17 dead permission slugs (Phase 3)
- [ ] Migrate ~20 pages off ad hoc inline permission checks onto a revived `HasPermission`/`usePermission` (Phase 4)
- [ ] Add `ProtectedRoute` gates to `/messages`, `/announcements`, `/forums` (Phase 5)
