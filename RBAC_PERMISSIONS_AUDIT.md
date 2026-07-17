# RBAC / Permissions Audit Report

**Scope:** Full backend (PHP MVC) + frontend (React/TS) review of role-based access control — architecture, route/page coverage, enum parity, and gaps.
**Date:** 2026-07-16

---

## 1. Architecture Summary

### Backend
- **Permission enum:** `backend/app/Constants/Permissions.php` — 101 `public const` slugs (e.g. `MANAGE_ROLES`, `VIEW_STUDENTS`) + static `all()` list.
- **DB schema:** `roles`, `permissions`, `permission_categories`, `role_permissions` (many-to-many). Canonical rebuild/seed: `backend/database/migrations/2026_04_27_028_roles_and_permissions_final.sql`.
  - 8 system roles: `superadmin`, `admin`, `registrar`, `hr_manager`, `lecturer`, `finance_officer`, `applicant`, `student` (lines 195-203).
  - `admin` is seeded with **every permission except `MANAGE_ROLES`/`MANAGE_PERMISSIONS`** (lines 240-243) — intended to NOT manage roles/permissions.
- **Middleware guards:**
  - `AuthMiddleware` — JWT validation only, no permission logic.
  - `PermissionMiddleware` (single required permission) / `MaybePermissionMiddleware` (OR-list) — the actual enforcement points on routes.
  - `ApplicantMiddleware` — role === `'applicant'` check for applicant self-service.
  - `DeployKeyMiddleware` — separate secret for CI-only `/api/deploy/*`.
- **JWT payload:** `AuthService.php` bakes `role_name` (string) and `permissions` (slug array from `RolePermissionModel::getSlugsForRole()`) into every login/OTP/`/auth/me` response.

### Frontend
- **Permission enum:** `frontend/src/constants/permissions.ts` — `PERMISSIONS` object, 101 keys, explicitly documented as a mirror of the backend enum.
- **Route guard:** `ProtectedRoute.tsx` (`requiredPermissions` / `requiredRoles` props).
- **Component gate:** `HasPermission.tsx` — exists but is **dead code**, zero usages elsewhere in `src/`.
- **Sidebar:** single `NAV_TREE` array in `MainLayout.tsx` (~1400 lines), each node optionally carrying `permissions[]` / `roles[]` / `hideForRoles[]`.
- **Action-button gating:** no shared hook — done via ~20 separate files with inline `user?.permissions.includes(...)` checks (see §4).

---

## 2. Critical Findings

### Finding A — Role-name string bypass enables privilege escalation (Critical)
`PermissionMiddleware.php:38`, `MaybePermissionMiddleware.php:39`, `ProtectedRoute.tsx:45`, `HasPermission.tsx:15`, and `MainLayout.tsx:992` **independently** hardcode:
```php
in_array($user['role'], ['superadmin', 'admin'], true)
```
This is a string match on the role's `name` column — not a stable ID or `is_system` flag, and not derived from actual `role_permissions` rows.

Consequences:
1. `RoleController::create()` / `update()` (`RoleController.php:49-110`) let any user holding only `MANAGE_ROLES` create or rename a role to exactly `admin` or `superadmin` — instantly granting **blanket bypass of every permission check, frontend and backend**, regardless of what's actually assigned to that role in `role_permissions`.
2. `RoleController::destroy()` (line 112-125) has **no protection deleting the Superadmin role** — acknowledged in an inline comment as a known gap.
3. This directly **contradicts the DB seed's intent**: the seed explicitly excludes `admin` from `MANAGE_ROLES`/`MANAGE_PERMISSIONS` (`2026_04_27_028_roles_and_permissions_final.sql:240-243`), but the code-level bypass overrides that at runtime for any role literally named `admin`.
4. The same literal string check is duplicated ad hoc in 8+ additional controllers (`AcademicAnalyticsController.php:40`, `ApplicationAdminController.php:31`, `AttendanceController.php:58`, `ModuleMarksController.php:53`, `ForumController.php:494`, `MessageController.php:57,62,581`, `SearchController.php:42`) with no shared helper — a future rename of the canonical admin role breaks some bypasses and not others.

**Recommendation:** Replace the name-string bypass with an `is_system` boolean flag on the `roles` table (or a dedicated `role_id` constant), enforced at role-mutation time (block create/rename/delete of protected system roles) rather than checked ad hoc at every permission gate.

### Finding B — Finance permission granularity mismatch (Medium)
`FinanceHub.tsx` gates individual tabs behind granular frontend-only slugs (`VIEW_FINANCE_OVERVIEW`, `VIEW_FINANCE_BILLING`, `VIEW_FINANCE_APPROVALS`, `VIEW_FINANCE_STRUCTURES`, `VIEW_FINANCE_BURSARIES`), but `backend/routes/api/finance.php:59-64` only enforces the coarse `VIEW_FINANCE`/`MANAGE_FINANCE` set for those same endpoints. A role granted only `VIEW_FINANCE_BILLING` (without `VIEW_FINANCE`) would see the tab in the UI but get a 403 from the API.

**Recommendation:** Either enforce the granular slugs in `finance.php` to match the frontend, or collapse the frontend tabs back to the coarse permission to avoid a misleading UI.

---

## 3. Enum/Constant Parity

**Result: 100% parity, zero drift.** All 101 slugs in `backend/app/Constants/Permissions.php` exist in `frontend/src/constants/permissions.ts` and vice versa. Both files document the "must stay in sync" contract, and it is currently honored.

### Dead/unenforced permission slugs (17)
Declared in both enums but referenced by **no backend route** and **no frontend router/sidebar gate**:

`BROADCAST_MESSAGES`, `MANAGE_CLEARANCE`, `MANAGE_MERIT_LIST`, `MANAGE_MESSAGES`, `MANAGE_OWN_PROFILE`, `MANAGE_TIMETABLE`, `VIEW_CLEARANCE`, `VIEW_EXAMS`, `VIEW_SETTINGS`, `VIEW_TIMETABLE`, `VIEW_MERIT_LIST` (used once in `SearchController.php:55` but not by any middleware), and the Finance sub-slugs from Finding B: `VIEW_FINANCE_APPROVALS`, `VIEW_FINANCE_BALANCE`, `VIEW_FINANCE_CLEARANCE`, `VIEW_FINANCE_EXPENSES`, `VIEW_FINANCE_REFUNDS`, `VIEW_FINANCE_SPONSORS`.

**Recommendation:** Either wire these into the relevant routes/pages (they suggest planned-but-unfinished features — timetable, clearance, merit list, own-profile management) or remove them to avoid confusing future audits.

---

## 4. Module-by-Module Enforcement Matrix

| Module | Backend route MW | Frontend page gate | Frontend action gate | Status |
|---|---|---|---|---|
| Roles / Permissions (RBAC admin) | `MANAGE_ROLES`/`MANAGE_PERMISSIONS` | matching | inline | **Finding A gap** |
| Users | `MANAGE_USERS` | matching | inline (`UserDropdown.tsx`) | OK |
| Students | Split `VIEW_STUDENTS`/`MANAGE_STUDENTS`, self-service open | matching | inline (`StudentDetailsPage.tsx`) | OK |
| Document Generation | `GENERATE_DOCUMENTS` | matching | n/a | OK |
| HR (Employees/Payroll/Leave/Appraisals) | Split read/write + self-service | matching | inline per page | OK |
| Academics Management (catalog) | Per-entity `MANAGE_*` | OR-list | `EntityCrudTabs.tsx` inline | OK |
| Modules Management | Split by pillar + self-service | OR-list + per-tab | inline | OK |
| Admissions | Per-sub-resource + open public portal | OR-list | not fully audited | OK |
| Applicant Portal | Auth + `ApplicantMiddleware` (role check) | role + permission double-gate | n/a | OK |
| **Finance** | Coarse OR-list for most sub-tabs | **Granular per-tab** | inline | **Finding B gap** |
| Fines / Overdue Alerts | `VIEW_FINES`/`MANAGE_FINES`/`SEND_FEE_ALERTS` | matching | n/a | OK |
| Exams (Schedule/Results/Deliberation/Grading) | Split read/write | matching | inline | OK — `VIEW_EXAMS` const declared but dead |
| Attendance | Split read/write + self-service | OR-list | inline | OK |
| Gate Management | `ACCESS_GATE`/`MANAGE_GATE` | OR-list | n/a | OK |
| Graduands/Transcripts/Certificates | Per-feature perms + self-service | matching | inline | OK |
| Academic Analytics | `VIEW_ACADEMIC_ANALYTICS` | matching | n/a | OK (minor bypass duplication) |
| System Documents | Read open, write `MANAGE_ACADEMIC_SETTINGS` | gated | n/a | OK — read intentionally open |
| System Logs | `VIEW_SYSTEM_LOGS` | matching | n/a | OK |
| Messaging | Auth only (ownership in controller) | **no route gate** (by design) | sidebar hides w/o `SEND_MESSAGES` | Intentional; `MANAGE_MESSAGES`/`BROADCAST_MESSAGES` dead slugs |
| Announcements | Feed open, manage gated | **no route gate** (page self-gates) | inline | Consistent w/ backend |
| Forums | Read/participate OR-list, moderate gated | **no route gate** | inline | Backend still enforces; FE route gate missing |
| AI Assistant | Auth only (intentional) | n/a (widget) | n/a | OK |
| Global Search | Auth only, per-entity filtering in controller | n/a (widget) | n/a | OK |
| Navigation endpoint | Auth only | n/a | n/a | Appears to be dead/unused code (sidebar uses static `NAV_TREE`, not this endpoint) |
| Deploy (CI) | `DeployKeyMiddleware` only, no JWT | n/a | n/a | Correct isolation |
| Public Portal (apply/verify) | No middleware (by design) | no route guard (by design) | n/a | Intentional |

---

## 5. Recommendations (Priority Order)

1. **Fix Finding A immediately** — replace role-name string bypass with an `is_system`/protected-role flag; block create/rename/delete of protected system roles in `RoleController`. This is the only genuine security-severity issue found.
2. Add backend enforcement for granular `VIEW_FINANCE_*` slugs in `finance.php`, or simplify the frontend Finance tabs to match backend granularity (Finding B).
3. Decide the fate of the 17 dead permission slugs — implement (timetable, clearance, merit list, own-profile self-service) or remove them.
4. Consolidate the ad hoc inline `user.permissions.includes(...)` button-gating pattern across ~20 page files into the existing (but currently unused) `HasPermission.tsx` component, and ensure it applies the same superadmin/admin handling as `ProtectedRoute`/`MainLayout` for consistency once Finding A is fixed.
5. Add explicit frontend `ProtectedRoute` gates for `/messages`, `/announcements`, `/forums` matching the sidebar's permission checks, purely for UX consistency (backend already enforces correctly; users can currently reach these by direct URL even when the sidebar hides them, which is low risk but inconsistent).
6. Consider deleting or documenting the unused `navigationService`/`/api/navigation` endpoint — it appears to duplicate the static `NAV_TREE` sidebar logic with no callers.

---

## 6. What's Working Well

- **Zero enum drift** between backend and frontend permission constants — an unusually well-maintained contract.
- Nearly every module correctly splits **read vs. write** permissions and separates **self-service** endpoints (own payroll, own attendance, own profile) from admin-scoped ones, with explicit code comments justifying every intentionally open endpoint.
- Route-level middleware coverage is comprehensive — no module with real business logic was found lacking *some* auth+permission gate; all "open" endpoints (messaging, search, navigation, AI chat, public portal) are deliberate and documented in code.
