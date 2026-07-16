You are implementing RBAC hardening work for the cur-mis codebase (PHP 8.4 MVC backend + React/TS/Vite frontend). Two documents already exist in the project root and are the source of truth for this work — read both in full before touching any code:

- `RBAC_PERMISSIONS_AUDIT.md` — the audit findings (Finding A: role-name string bypass privilege-escalation gap; Finding B: finance permission granularity mismatch; 17 dead permission slugs; module-by-module enforcement matrix).
- `RBAC_IMPLEMENTATION_PLAN.md` — the 6-phase implementation plan derived from that audit.

A migration implementing part of Phase 1/2 already exists at `backend/database/migrations/2026_07_16_103_rbac_hardening_is_system_and_grants.sql` — it adds `roles.is_system`, flags the 8 canonical roles, and grants the missing granular finance permissions. Do not re-create it; run it (or confirm it has already been applied) before writing code that depends on the `is_system` column existing.

## Ground rules

- Work phase by phase, in the order given in `RBAC_IMPLEMENTATION_PLAN.md`. Do not skip ahead — later phases assume earlier ones landed (e.g. Phase 2/4 assume the centralized `isSuperadmin()` helper from Phase 1 exists).
- After each phase, stop and summarize what changed and what you verified, before moving to the next phase, so I can review incrementally rather than getting one giant diff.
- This is a live production RBAC system — prefer additive, backward-compatible changes. Never remove a permission grant from a role without flagging it to me first; only ever add new middleware/grants or add safety rails around role mutation.
- Follow the existing code conventions in the repo (PHP: `App\Middleware`, `App\Constants\Permissions`, `Core\Request`/`Core\Response`; frontend: Zustand `authStore`, existing `ProtectedRoute`/`PERMISSIONS` constant patterns). Don't introduce a new pattern (e.g. a different permission-check library) when an existing one already does the job.
- Do not add comments explaining what the code does — only comment non-obvious rationale, matching the terse style already in this codebase's migrations and controllers.

## Phase 1 — Fix the critical privilege-escalation bug (Finding A)

Run/confirm the migration above, then:

1. In `backend/app/Controllers/RoleController.php`:
   - `create()`: reject (409) if the submitted `name` case-insensitively collides with an existing role's `name`, with special attention to `superadmin`/`admin` — but note the general "name already exists" check at line 61 already covers exact collisions; make sure it's case-insensitive too, since `Admin` vs `admin` would otherwise slip through and still trigger the bypass once Phase 1's centralized check is in place.
   - `update()`: if the target role has `is_system = 1`, reject any attempt to change `name` with 403 (still allow `description`/`enforce_campus_scope` edits).
   - `destroy()`: if the target role has `is_system = 1`, reject with 403. Replace the comment at line 120 ("Cannot delete Superadmin easily... but for now standard delete") since this closes that exact gap.
   - Make sure `RoleModel::find()` / `getWithUserCounts()` return `is_system` in the payload so the frontend can grey out rename/delete affordances in `RolesManagementPage.tsx`.

2. Create one centralized helper instead of the ~12 duplicated string checks:
   - Backend: add a static method (e.g. `AuthService::isSuperadmin(array $user): bool`) that checks `$user['role'] === 'superadmin'` only — **drop `admin` from the hardcoded bypass list entirely**. The `admin` role already holds every permission except `MANAGE_ROLES`/`MANAGE_PERMISSIONS` via `role_permissions` (per the DB seed), so it doesn't need a bypass; removing it from the hardcoded list is what actually fixes Finding A, since it means the DB-declared exclusion of `admin` from role/permission management now actually holds at runtime.
   - Update `PermissionMiddleware.php`, `MaybePermissionMiddleware.php`, `AcademicAnalyticsController.php:40`, `ApplicationAdminController.php:31`, `AttendanceController.php:58`, `ModuleMarksController.php:53`, `ForumController.php:494`, `MessageController.php:57,62,581`, `SearchController.php:42` to call the new helper instead of their own inline `in_array(...)` check.
   - Frontend: add a `isSuperadmin(user)` util (e.g. `src/utils/permissions.ts`), same `superadmin`-only logic, and update `ProtectedRoute.tsx:45`, `HasPermission.tsx:15`, `MainLayout.tsx:992` to use it.

3. Verify: log in as a user with role `admin` and confirm they can no longer reach `/api/roles` or `/api/permissions` management endpoints unless explicitly granted `MANAGE_ROLES`/`MANAGE_PERMISSIONS` (they shouldn't be, per the seed). Confirm `superadmin` is unaffected. Confirm attempting to rename/delete a `is_system=1` role returns 403, and creating a new role named `Admin` (any case) returns 409.

## Phase 2 — Finance permission granularity (Finding B)

In `backend/routes/api/finance.php`, split the single read-group `MaybePermissionMiddleware([VIEW_FINANCE, MANAGE_FINANCE, VIEW_MOBILE_PAYMENTS, VIEW_ONLINE_PAYMENTS_HISTORY])` (lines 22-64) into narrower per-route-group middleware that also matches what `frontend/src/pages/finance/FinanceHub.tsx` already gates its tabs on:

- `/structures*`, `/pg-intl-structures` → add `VIEW_FINANCE_STRUCTURES` as an additional OR option
- `/billing/*` → add `VIEW_FINANCE_BILLING`
- `/bursaries` → add `VIEW_FINANCE_BURSARIES`
- `/sponsors` → add `VIEW_FINANCE_SPONSORS`
- `/expenses*` → add `VIEW_FINANCE_EXPENSES`
- `/refunds` → add `VIEW_FINANCE_REFUNDS`
- `/balance` → add `VIEW_FINANCE_BALANCE`
- `/clearance*` → add `VIEW_FINANCE_CLEARANCE`
- `/reports/*` → add `VIEW_FINANCE_REPORTS`
- `/summary` → add `VIEW_FINANCE_OVERVIEW`

Keep `VIEW_FINANCE`/`MANAGE_FINANCE` in every group's OR-list alongside the granular slug — this is additive, not a replacement, so nobody currently working loses access. The migration already granted these granular slugs to every role holding the coarse ones, so this should be a no-op in practice for existing users, but closes the gap for future roles that are given only a granular slug.

Verify: create a test role with only `VIEW_FINANCE_BILLING` granted (no `VIEW_FINANCE`), confirm it can hit `GET /api/finance/billing/summary` but gets 403 on `GET /api/finance/refunds`.

## Phase 3 — Wire up or retire the 17 dead permission slugs

Go slug by slug per the table in `RBAC_IMPLEMENTATION_PLAN.md` Phase 3. For each, either:
(a) add the missing route middleware / frontend gate that should have existed, or
(b) if the underlying feature genuinely doesn't exist yet (e.g. no timetable module), leave a short comment marking it reserved for a future module (matching the existing pattern in migration `2026_07_15_095_rbac_phase0_finance_slugs.sql`) and tell me which slugs you classified this way rather than silently doing nothing.

Do not delete any permission constant from `Permissions.php` or `permissions.ts` without explicit confirmation from me first, since that's a breaking change to the enum contract the audit flagged as currently perfect (101/101 parity).

## Phase 4 — Consolidate frontend permission-gating

Turn `frontend/src/components/layout/HasPermission.tsx` (currently unused) into the single reusable permission gate, backed by a `usePermission(slug)` / `useAnyPermission(slugs[])` hook that internally uses the `isSuperadmin()` util from Phase 1. Then migrate the ad hoc `user?.permissions.includes(...)` checks in the ~20 files listed in the plan's Phase 4 section onto this component/hook, one file at a time. This should be a pure refactor with no behavior change except correctly applying the superadmin bypass everywhere consistently.

## Phase 5 — Frontend route-gate consistency

Add matching `requiredPermissions` (`SEND_MESSAGES`, `VIEW_ANNOUNCEMENTS`, `VIEW_FORUMS`) to the `ProtectedRoute` wrapping `/messages`, `/announcements`, `/forums` in `App.tsx:168-171`, so direct-URL navigation respects the same gate the sidebar already applies.

## Phase 6 — Verification

After all phases: run existing backend/frontend test suites if present, and do a manual click-through as each of the 8 seeded roles (especially `admin`, since its effective permissions change the most) confirming no previously-working page/action regresses. Report anything that breaks before considering the work done.
