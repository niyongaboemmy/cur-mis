# Public Service Request Platform — Implementation Plan

**Author:** Senior Analyst
**Date:** 2026-07-21
**Depends on:** [`PUBLIC_SERVICE_REQUEST_RESEARCH.md`](./PUBLIC_SERVICE_REQUEST_RESEARCH.md) (architecture/design rationale — read that first; this document is the concrete build plan)

This plan wires the previously-designed schema (`service_catalog`, `service_catalog_stages`, `service_requests`, `service_request_attachments`, `service_request_approvals`) into this specific codebase's actual conventions: the router auto-loader, `MigrationService`, `BaseController`, `FileServerClient`, `UrubutoPayService`, and the frontend's `api.ts` / `ProtectedRoute` / admin-page patterns. Every step below names the real file to touch and mirrors an existing, working example.

---

## 0. Conventions confirmed in this codebase (do not deviate)

- **Routes**: drop a new file at `backend/routes/api/service_requests.php` — `backend/routes/api.php` auto-loads every file under `backend/routes/api/*.php` via `glob()`. No manual registration.
- **Route groups**: `$router->group('/api/admin', fn($router) => ..., [AuthMiddleware::class])` with nested `$router->group('/service-requests', fn($router) => ..., [new PermissionMiddleware(Permissions::X)])`. Literal path segments must precede `:id` wildcards inside the same group (mirrors `backend/routes/api/applications.php`).
- **Controllers**: extend `BaseController`, use only its two helpers — `$this->success($response, $data, $message, $status, $extra)` and `$this->error($response, $message, $status, $errors)`, both `never`-returning. No `authUser()` helper exists — pull the authenticated user from `$request->param('_auth_user')` (set by `AuthMiddleware`) exactly as `ApplicationAdminController.php:227-228` does.
- **Migrations**: just add numbered `.sql` files to `backend/database/migrations/`; `MigrationService::allFiles()` globs and sorts by filename, tracks applied files in `schema_migrations`. Apply via `php backend/scripts/migrate.php` (`--status` to check, `--force <file>` to re-run one). **Do not** touch `run_migrations.php`/`migrate_all.php` — legacy, hardcoded file lists.
- **Status transitions**: mirror `ApplicationService.php` exactly — an `$allowedStatuses` whitelist array checked with `in_array(..., true)` before any transition, and every transition written via a `logStatusChange()`-shaped method into a dedicated log table (from-status, to-status, actor id, actor type, notes).
- **PDF documents**: add to `DocumentController::ALLOWED_TYPES` (a plain const array of slugs) and one `match()` arm dispatching to a new Helper class shaped like `AdmissionLetterPdf.php` (`buildHtml()` / `streamPdf()` / `renderPdfBinary()`).
- **File uploads**: never write to local disk directly — go through `backend/app/Helpers/FileServerClient.php` (`upload()`/`download()`/`delete()`, cURL to an external file-server microservice), exactly as `ApplicationPortalController::uploadDocument()` (line ~464) does: validate extension → `(new FileServerClient())->upload($file)` → persist the returned `id`/`original_name`/`size`/`mime`.
- **Frontend calls**: use the shared `frontend/src/services/api.ts` (`api.get/post/upload`, axios instance with JWT interceptor — note `api.put`/`api.patch` both actually send POST, there is no server-side PUT/PATCH support). Add one new per-domain service file per frontend domain, exporting plain objects of functions, same shape as `admissionService.ts`.
- **Frontend permission gating**: add constants to `frontend/src/constants/permissions.ts` (must mirror backend `App\Constants\Permissions` string-for-string), gate routes in `App.tsx` with `<Route element={<ProtectedRoute requiredPermissions={PERMISSIONS.X} />}>`.
- **Admin CRUD UI shape**: mirror `frontend/src/pages/admin/RolesManagementPage.tsx` — single-file page, `useState` for list/loading/modal/editing-item/search/sort, `ModalPortal`-wrapped form modal, `toast` feedback.
- **Audit logging**: call `SystemLogService::log($action, $module, $description, $entityId, $entityType, $metadata, $actor)` inline after every mutating action, module `'SERVICE_REQUESTS'`, actions from the existing vocabulary (`CREATE|APPROVE|REJECT|GENERATE`).

---

## 1. Migrations (backend/database/migrations/)

Start numbering after the latest applied migration at plan time (`2026_07_21_109_...` as of this writing — **re-check with `php backend/scripts/migrate.php --status` before creating files**, since more may have merged since).

| File | Contents |
|---|---|
| `2026_07_21_110_create_service_catalog_tables.sql` | `service_catalog`, `service_catalog_stages` (see schema in research doc §4.1–4.2) |
| `2026_07_21_111_create_service_requests_tables.sql` | `service_requests`, `service_request_attachments`, `service_request_approvals` (research doc §4.3), plus indexes on `request_code` (UNIQUE), `status`, `service_id`, `student_regnumber` |
| `2026_07_21_112_service_requests_rbac_permissions.sql` | INSERT into `permissions` (+ `permission_categories` row `'Service Requests'` if categorized): `manage_service_catalog`, `submit_service_request`, `approve_service_request_l1`, `approve_service_request_l2`, `approve_service_request_final`, `view_service_requests`, `void_service_request` |
| `2026_07_21_113_service_requests_fee_type.sql` | Extend `fee_invoices.fee_type` enum/lookup with `service_request` (check whether it's a MySQL `ENUM` column or a lookup table first — adjust `ALTER TABLE` vs `INSERT` accordingly) |

Each file must be **idempotent-tolerant** like the rest of the migration set (MigrationService tolerates "already exists" errors, but write `CREATE TABLE IF NOT EXISTS` / `INSERT IGNORE` defensively anyway).

---

## 2. Backend: Models

`backend/app/Models/`:
- `ServiceCatalogModel.php` — CRUD over `service_catalog` (list active/all, find by slug, create/update/deactivate). Follow `FeeTypeModel.php`'s shape (simple lookup CRUD) as the closest analog.
- `ServiceCatalogStageModel.php` — CRUD over `service_catalog_stages`, `findByServiceOrdered(int $serviceId): array`.
- `ServiceRequestModel.php` — CRUD over `service_requests`, plus `findByCode(string $requestCode)`, `findByStudent(string $regnumber)`, `updateStatus(int $id, string $status, array $extra = [])`.
- `ServiceRequestAttachmentModel.php` — CRUD over `service_request_attachments`.
- `ServiceRequestApprovalModel.php` — append-only log model, mirrors the shape of `ApplicationService`'s status-log model (`create()` only, no update/delete).

## 3. Backend: Services

`backend/app/Services/`:

### `ServiceCatalogService.php`
- `listPublic(): array` — active services only, minimal public-safe fields (no internal stage config).
- `getPublicDetail(string $slug): ?array` — full description/requirements/fee for the detail page.
- `listForAdmin(): array` / `create(array $data): array` / `update(int $id, array $data): array` / `deactivate(int $id): void` — full CRUD incl. nested stage config, permission-gated at the controller layer.

### `ServiceRequestService.php` (core state machine — mirror `ApplicationService.php` precisely)
```php
private const ALLOWED_TRANSITIONS = [
    'draft'              => ['submitted'],
    'submitted'          => ['in_review'],
    'in_review'          => ['in_review', 'approved', 'rejected', 'changes_requested'], // advance stage, or terminal/branch
    'changes_requested'  => ['submitted'],
    'approved'           => ['awaiting_payment'],
    'awaiting_payment'   => ['paid', 'cancelled', 'expired'],
    'paid'               => ['completed'],
];
```
Methods:
- `submit(array $formData, array $attachments, array $requester): array` — validates against `service_catalog.required_attachments`, creates `service_requests` row (`status = 'submitted'`, `current_stage_order = 1`), uploads attachments via `FileServerClient`, generates `request_code` (e.g. `SR-{YEAR}-{zero-padded id}`), logs via `SystemLogService::log('CREATE', 'SERVICE_REQUESTS', ...)`.
- `decide(int $requestId, string $decision, int $actorId, string $actorRole, ?string $comment): array` — validates the acting stage's `required_permission_slug` was already checked by `PermissionMiddleware` at the route layer (defense-in-depth: re-check `current_stage_order` matches the actor's granted stage); on `approved` at a non-final stage, increments `current_stage_order` and stays `in_review`; on the `is_final_approval` stage, transitions to `approved` then immediately to `awaiting_payment` (creating the linked invoice — see §4); on `rejected`/`changes_requested`, transitions accordingly. Every call appends one `service_request_approvals` row (mirrors `logStatusChange()`).
- `getTrackingStatus(string $requestCode, string $identifier): ?array` — public tracking lookup (request_code + national_id/phone match), returns coarse status only (no internal stage/approver detail), mirrors `/apply/track`'s existing controller-level lookup pattern.
- `markPaid(int $requestId, array $paymentMeta): void` — called from the payment webhook hook (§4), transitions `awaiting_payment → paid`, triggers document generation (§5).

## 4. Backend: Payment Wiring (extend, don't duplicate, UrubutoPay)

- `UrubutoPayService.php`: add a `service_request` entry to the `SERVICE_MAP` const, and a `generateServiceRequestCheckoutUrl(int $requestId): array` method mirroring `generateApplicationCheckoutUrl()` — resolve the linked `fee_invoices` row, build the same `https://urubutopay.rw/pay-now?mhcd=...&pycd=...` redirect shape.
- `UrubutoPayController::paymentCallback()` (existing method, `backend/app/Controllers/UrubutoPayController.php:124`): after the existing `recordMobilePayment()` call, add a branch — if the paid invoice's `fee_type === 'service_request'`, resolve the linked `service_requests.id` and call `ServiceRequestService::markPaid()`. This is the **only** existing file that needs a new branch rather than a wholly new file, since the webhook entry point is shared infrastructure.
- On `service_requests.payment_stage = 'before_review'` services (the Irembo-style alternative flagged as an open decision in the research doc), the invoice is instead created at `submit()` time and the approval queue simply filters to `status IN ('paid', ...)` before showing requests to reviewers — same tables, different service-level config, no new code path.

## 5. Backend: Document Generation

- New Helper `backend/app/Helpers/ServiceRequestDocumentPdf.php`, same shape as `AdmissionLetterPdf.php`: `buildHtml(array $data): string`, `streamPdf(array $data, string $filename): void`, `renderPdfBinary(array $data): ?string`. Template driven by `service_catalog.document_template_type` — either one generic templated letter (placeholders for requester name, service name, approval chain summary, QR/verification code via `PdfLayout::stampHeader()`) or per-type builders if services need materially different layouts (decide during Phase 4 based on what services are onboarded first).
- `DocumentController.php`: add `'service_request'` to `ALLOWED_TYPES` (line ~14-24) and a `match()` arm in both `preview()` and `download()` dispatching to `ServiceRequestDocumentPdf`.
- Generation is triggered once, inside `ServiceRequestService::markPaid()` — not lazily per download — storing `document_generated_at` and a signed, short-lived `download_token` (reuse whatever token/signing helper the admission-letter token-based download already uses, e.g. `ApplicationPortalController`'s applicant-token pattern, so this isn't a new signing scheme).

## 6. Backend: Controllers & Routes

New controllers in `backend/app/Controllers/`:
- `ServiceCatalogController.php` — public `index()`/`show($slug)` (no auth), admin `store()`/`update()`/`destroy()` (permission `manage_service_catalog`).
- `ServiceRequestController.php` — student `submit()`, `myRequests()`, `getCheckoutLink($id)` (delegates to the new UrubutoPay method), `download($id)`; public `track()`.
- `ServiceRequestApprovalController.php` — staff `queue()` (filtered by the caller's granted stage permission), `decide($id)`.

New route file `backend/routes/api/service_requests.php`:
```php
// Public
$router->get('/api/services', [ServiceCatalogController::class, 'index']);
$router->get('/api/services/:slug', [ServiceCatalogController::class, 'show']);
$router->get('/api/services/track', [ServiceRequestController::class, 'track']);

// Student (authenticated)
$router->group('/api/service-requests', function ($router) {
    $router->post('', [ServiceRequestController::class, 'submit']);
    $router->get('/mine', [ServiceRequestController::class, 'myRequests']);
    $router->get('/:id/checkout-link', [ServiceRequestController::class, 'getCheckoutLink']);
    $router->get('/:id/download', [ServiceRequestController::class, 'download']);
}, [AuthMiddleware::class]);

// Staff approval queue (permission-gated per stage inside the controller, since a queue may serve multiple stage permissions)
$router->group('/api/service-requests/approvals', function ($router) {
    $router->get('/queue', [ServiceRequestApprovalController::class, 'queue']);
    $router->post('/:id/decide', [ServiceRequestApprovalController::class, 'decide']);
}, [AuthMiddleware::class, new MaybePermissionMiddleware([
    'approve_service_request_l1', 'approve_service_request_l2', 'approve_service_request_final',
])]);

// Admin catalog management
$router->group('/api/admin/service-catalog', function ($router) {
    $router->get('', [ServiceCatalogController::class, 'listAdmin']);
    $router->post('', [ServiceCatalogController::class, 'store']);
    $router->post('/:id', [ServiceCatalogController::class, 'update']);
    $router->post('/:id/deactivate', [ServiceCatalogController::class, 'deactivate']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_SERVICE_CATALOG)]);
```
Add `MANAGE_SERVICE_CATALOG` (and friends) as class constants in `backend/app/Constants/Permissions.php`, matching the slugs inserted by migration `112`.

## 7. Frontend

### Services (`frontend/src/services/`)
- `serviceCatalogService.ts` — `getPublicList()`, `getPublicDetail(slug)`, admin `list()/create()/update()/deactivate()`.
- `serviceRequestService.ts` — `submit(formData, files)` (uses `api.upload`), `myRequests()`, `getCheckoutLink(id)`, `track(code, identifier)`.
- `serviceRequestApprovalService.ts` — `getQueue()`, `decide(id, payload)`.

### Pages
- `frontend/src/pages/public/services/ServiceCatalogPage.tsx` — public list/grid, no auth.
- `frontend/src/pages/public/services/ServiceDetailPage.tsx` — public detail; "Apply" button routes into the existing `ApplicantAuthGate.tsx`-style login/register interstitial before the request form (reuse, don't fork, this component — check whether it's student-specific or generic enough to reuse directly; if it hardcodes "applicant" language, add a `context` prop rather than duplicating the component).
- `frontend/src/pages/public/services/TrackServiceRequestPage.tsx` — mirrors `TrackApplicationPage.tsx` structure.
- `frontend/src/pages/student/service-requests/MyServiceRequestsPage.tsx` — list + status, pay button (redirects to checkout URL), download button (disabled until `status` is `paid`/`completed`).
- `frontend/src/pages/service-requests/ServiceRequestApprovalQueuePage.tsx` — staff queue, approve/reject/request-changes actions, permission-gated per visible action (only show the decide button if the user holds that stage's permission — fetch user's permission list from existing auth context, same as other dashboard pages already do).
- `frontend/src/pages/admin/ServiceCatalogManagementPage.tsx` — mirrors `RolesManagementPage.tsx` structure (list/search/sort + `ModalPortal` create/edit form, including a repeatable "stages" sub-form for `service_catalog_stages`).

### Routing (`frontend/src/App.tsx`)
```tsx
{/* Public, above ProtectedRoute */}
<Route path="/services" element={<ServiceCatalogPage />} />
<Route path="/services/:slug" element={<ServiceDetailPage />} />
<Route path="/services/track" element={<TrackServiceRequestPage />} />

{/* Inside ProtectedRoute, no extra permission needed — any logged-in student */}
<Route path="/my/service-requests" element={<MyServiceRequestsPage />} />

{/* Permission-gated */}
<Route element={<ProtectedRoute requiredPermissions={[PERMISSIONS.APPROVE_SERVICE_REQUEST_L1, PERMISSIONS.APPROVE_SERVICE_REQUEST_L2, PERMISSIONS.APPROVE_SERVICE_REQUEST_FINAL]} anyOf />}>
  <Route path="/service-requests/queue" element={<ServiceRequestApprovalQueuePage />} />
</Route>
<Route element={<ProtectedRoute requiredPermissions={PERMISSIONS.MANAGE_SERVICE_CATALOG} />}>
  <Route path="/admin/service-catalog" element={<ServiceCatalogManagementPage />} />
</Route>
```
(Check `ProtectedRoute`'s actual prop signature for "any of several permissions" — `MaybePermissionMiddleware`'s array-based any-of pattern exists server-side; confirm the frontend equivalent exists or add it, since the queue page must be visible to any single-stage approver, not only someone holding all three permissions.)

### Constants (`frontend/src/constants/permissions.ts`)
Add, string-for-string identical to the backend constants added in §6:
```ts
MANAGE_SERVICE_CATALOG: 'MANAGE_SERVICE_CATALOG',
SUBMIT_SERVICE_REQUEST: 'SUBMIT_SERVICE_REQUEST',
APPROVE_SERVICE_REQUEST_L1: 'APPROVE_SERVICE_REQUEST_L1',
APPROVE_SERVICE_REQUEST_L2: 'APPROVE_SERVICE_REQUEST_L2',
APPROVE_SERVICE_REQUEST_FINAL: 'APPROVE_SERVICE_REQUEST_FINAL',
VIEW_SERVICE_REQUESTS: 'VIEW_SERVICE_REQUESTS',
VOID_SERVICE_REQUEST: 'VOID_SERVICE_REQUEST',
```

---

## 8. Build Order & Checklist

Follow this order — each phase produces something independently testable before the next begins.

**Phase 1 — Data & permissions (no user-facing surface yet)**
- [ ] Confirm current migration head with `php backend/scripts/migrate.php --status`
- [ ] Write & apply migrations 110–113
- [ ] `ServiceCatalogModel`, `ServiceCatalogStageModel`, `ServiceRequestModel`, `ServiceRequestAttachmentModel`, `ServiceRequestApprovalModel`
- [ ] Add permission constants to `Permissions.php`
- [ ] Seed 1–2 real services manually via SQL for testing (e.g. "Official Transcript", 2 approval stages + payment)

**Phase 2 — Admin catalog management**
- [ ] `ServiceCatalogService` + `ServiceCatalogController` + admin routes
- [ ] `serviceCatalogService.ts` + `ServiceCatalogManagementPage.tsx` + admin route/permission gate
- [ ] Manual test: create/edit/deactivate a service with 3 stages through the UI

**Phase 3 — Public browse + submission**
- [ ] Public `index`/`show` endpoints + `ServiceCatalogPage.tsx`/`ServiceDetailPage.tsx`
- [ ] `ServiceRequestService::submit()` incl. `FileServerClient` attachment upload
- [ ] Login gate wiring (reuse/extend `ApplicantAuthGate.tsx`)
- [ ] Manual test: anonymous browse → login prompt → submit request → row appears with `status='submitted'`

**Phase 4 — Approval queue**
- [ ] `ServiceRequestApprovalController` + `decide()` state machine + `service_request_approvals` logging
- [ ] `ServiceRequestApprovalQueuePage.tsx`
- [ ] Manual test: 3 different staff accounts (one per stage permission) each see only their stage's queue, approving advances `current_stage_order` correctly, final approval flips to `awaiting_payment`

**Phase 5 — Payment gate**
- [ ] `UrubutoPayService::generateServiceRequestCheckoutUrl()` + `SERVICE_MAP` entry
- [ ] `UrubutoPayController::paymentCallback()` branch for `fee_type === 'service_request'`
- [ ] `MyServiceRequestsPage.tsx` pay button
- [ ] Manual test (sandbox/test merchant if UrubutoPay provides one, otherwise a stubbed webhook POST): invoice created on `awaiting_payment`, webhook flips to `paid`

**Phase 6 — Document + secure download**
- [ ] `ServiceRequestDocumentPdf.php` + `DocumentController::ALLOWED_TYPES` entry
- [ ] `download_token` generation on `markPaid()`, download endpoint validation
- [ ] Download button wiring in `MyServiceRequestsPage.tsx`
- [ ] Manual test: download blocked before payment (402/403), succeeds after, `SystemLogService` entries appear for generation + each download

**Phase 7 — Public tracking + audit polish**
- [ ] `track()` endpoint + `TrackServiceRequestPage.tsx`
- [ ] Verify `SystemLogService::log()` calls exist at every mutating step (submit, each decision, payment, generate, download)
- [ ] End-to-end smoke test of the full path: browse → login → submit → 3-stage approval → pay → download → public track lookup shows "Completed"

---

## 9. Verification Notes

- Use the project's `/verify` skill against the running app after each phase, driving the actual flow rather than relying on type-checks alone — this feature has a real runtime state machine and a real payment webhook, both of which need to be exercised, not just compiled.
- Before Phase 5, confirm with the user/UrubutoPay whether a sandbox merchant/service code is available for testing, or whether webhook behavior must be simulated with a manually-crafted POST to `paymentCallback` in a non-production environment.
- Re-confirm the 5 open decisions listed in the research doc (§6) before Phase 2 begins — particularly "who can request services" (affects `requester_type` handling in `submit()`) and "fixed vs. variable stage count" (affects whether the catalog admin form needs an "add stage" control from day one).
