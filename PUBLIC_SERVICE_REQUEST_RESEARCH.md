# Public Service Request Platform — Research & Design Report

**Author:** Senior Analyst
**Date:** 2026-07-21
**Scope:** Feasibility and architecture study for a citizen/student-facing "request a service → multi-role approval → pay → download document" module, modeled on Rwanda's IremboGov platform and adapted to the existing CUR-MIS (Catholic University of Rwanda Management Information System) codebase.

---

## 1. Executive Summary

The request is to build a public, Irembo-style service request flow: a visitor browses a catalog of institutional services (e.g. "Transcript Request", "Proof of Enrollment", "Recommendation Letter"), reads the service details without logging in, then must **log in as a student** to submit a request. The request passes through a **configurable multi-stage approval chain** (Submission → Role 1 → Role 2 → Role 3/Final → Payment), and only after the final approval **and** a confirmed payment is the generated document unlocked for download.

This is achievable **largely by composing patterns that already exist in this codebase** rather than inventing new infrastructure:

| Building block needed | Existing precedent to reuse |
|---|---|
| Dynamic role/permission model | RBAC tables (`roles`, `permissions`, `role_permissions`) — already fully dynamic, no code changes needed to add new approver roles |
| Multi-role sequential approval | `ApplicationService.php` admission workflow (status whitelist + `logStatusChange()`) |
| Payment gateway | `UrubutoPayService.php` / `UrubutoPayController.php` (UrubutoPay/BKTechouse) |
| PDF document generation | `DocumentHelper.php`, `AdmissionLetterPdf.php`, Dompdf |
| Public unauthenticated pages + "log in to continue" gate | `/apply` + `ApplicantAuthGate.tsx` pattern in `frontend/src/pages/public/` |
| Public tracking by reference code | `/apply/track` (`TrackApplicationPage.tsx`) |
| Audit trail | `SystemLogService::log()` |

The net-new work is primarily: (1) a **dynamic service catalog** with configurable approval-stage definitions per service, (2) a **service_requests** table + state machine, (3) an **approval log** table, and (4) wiring the existing UrubutoPay checkout + Dompdf pipelines to gate the download. No new payment gateway or PDF library is required.

---

## 2. How IremboGov Actually Works (research findings)

IremboGov (irembo.gov.rw) is Rwanda's national e-government portal, offering 100+ public services via web and USSD. Relevant mechanics for this design:

- **Browse before login.** The service catalog (`/home/citizen/all_services`) and individual service description pages (requirements, required attachments, fees) are publicly viewable without an account.
- **Login gate at the point of action.** A citizen can read everything, but clicking "Apply" requires login (email/phone + password, or National ID-based verification), because the platform needs an identity to attach the request to.
- **Submission with structured attachments.** Forms are dynamic per service — applicant details, then service-specific fields, then required document uploads (Irembo enforces file type/size, e.g. PDF ≤ 200KB).
- **Payment position varies by service — mostly upfront, not always at the end.** For paid services, once the application is submitted, the citizen receives a **Billing/Bill ID** immediately and can pay via mobile money (MTN/Airtel), bank (BK), or card (Visa/Mastercard), either right away or any time before the bill expires. Processing/approval by the responsible government office typically happens **after** payment is confirmed, not before.
- **Status tracking.** A citizen (logged in or not, using the billing/application number + National ID) can check status via a tracking search — this maps directly to this codebase's existing `/apply/track` page.
- **Multi-tier back-office approval is invisible to the citizen.** The citizen only sees coarse states (submitted → processing → ready/rejected); the multi-role review happening inside government back offices is not exposed as named stages to the public UI — only to internal staff.

**Design implication / open decision:** Irembo's real-world flow pays **before** processing begins (pay-to-submit-for-processing), whereas the requirement as stated for CUR is **pay-to-download-after-approval** (pay-at-the-end, after Role 3/final sign-off). Both are legitimate models; they are **not** the same thing and should not be conflated:

- **Pay-then-process (Irembo's model):** Reduces wasted staff effort on requests that never get paid for; risk is refunding if a request is ultimately rejected.
- **Approve-then-pay (this request's stated model):** Guarantees the university never has to issue a refund (staff already validated eligibility before money changes hands), at the cost of staff reviewing requests that might never be paid for.

This report designs for the **approve-then-pay** model since that is what was explicitly requested, but the schema below keeps the payment step as a distinct, ordered stage precisely so this policy can be flipped later per-service without a schema change (see §4.2).

Sources:
- https://irembo.gov.rw/home/citizen/all_services
- https://support.irembo.gov.rw/en/support/solutions/articles/47001146862-how-to-pay-for-a-service-on-irembogov
- https://support.irembo.gov.rw/en/support/solutions/47000526780
- https://iremboagent.freshdesk.com/en/support/solutions/articles/47001254306-application-and-payment-status-general-information-
- https://support.irembo.gov.rw/en/support/solutions/articles/47001262102-legalization-of-public-documents-from-rwanda-to-be-used-abroad-apostille

---

## 3. Relevant Existing CUR-MIS Architecture

### 3.1 RBAC — already dynamic, no schema change needed for new approver roles
Defined in `backend/database/migrations/2024_04_21_003_create_rbac_tables.sql`: `roles`, `permission_categories`, `permissions`, `role_permissions`. Roles are **database rows created/managed through the UI** (`RoleController.php`, `RoleModel.php`), not hardcoded — an institution can already create "Dean", "HOD", "Registrar Officer" roles today without a code change. `is_system` flags protect built-in roles from deletion.

Enforcement: `PermissionMiddleware` reads the flattened `permissions[]` array baked into the JWT at login and checks a **permission slug**, e.g.:
```php
[ServiceRequestController::class, 'approveStage1'], [AuthMiddleware::class, new PermissionMiddleware('approve_service_request_stage1')]
```
`AuthService::isSuperadmin()` bypasses all permission checks. There's also `MaybePermissionMiddleware` (soft-check, doesn't 403) and `ApplicantMiddleware` (hard-codes a `role === 'applicant'` JWT claim check — the one place role *name* is checked directly, for the existing applicant/admissions flow).

**Implication:** the 3-role approval chain should be enforced by **permission slugs** (e.g. `approve_service_request_stage1/2/3`), assigned to whatever role(s) the university wants at each institution — not hardcoded role names. This matches how finance permissions were rolled out (`2026_07_15_095_rbac_phase0_finance_slugs.sql`).

### 3.2 Payment — UrubutoPay is already live, reuse it
`UrubutoPayService.php` (~980 lines) + `UrubutoPayController.php` + `UrubutoPayWebhookMiddleware.php` implement a full mobile-money/card gateway integration (merchant code `TH90989816`):
- `generateCheckoutUrl()` / `generateApplicationCheckoutUrl()` build a hosted checkout redirect (`https://urubutopay.rw/pay-now?mhcd=...&pycd=...`) keyed by a `SERVICE_MAP` of service codes.
- Webhooks (`/api/payment/webhook/token`, `/verify`, `/callback`, `/reversal`) let UrubutoPay validate the payer and post back payment/reversal events.
- `recordMobilePayment()` writes to `fee_payments` (modern) + legacy `payment`/`bank_payment` tables and triggers `ClearanceService` recompute.
- Invoice status enum already exists: `unpaid | partial | paid | overdue | waived` (`2026_04_25_022_create_fee_management_tables.sql`); payment status: `pending | confirmed | rejected`.

**Implication:** add a new `SERVICE_MAP` entry / service_code (e.g. `service-request-fee`) and a new invoice `fee_type` (e.g. `service_request`) rather than building a second payment integration. The download gate becomes a one-line check: does this request's linked invoice have `status = 'paid'`?

### 3.3 Multi-stage approval — no generic engine exists; each module rolls its own
There is no shared "workflow engine" table. The **admission application** flow in `ApplicationService.php` is the closest and best precedent: a `status` column driven through an `$allowedStatuses` whitelist per transition, with every change written to a log via `logStatusChange()` (from-status, to-status, actor, actor role, timestamp, comment). `ClearanceService.php` (`student_clearances`) is a second precedent — binary cleared/not-cleared with `cleared_by`/`cleared_at` override columns.

**Implication:** this feature needs its **own** `service_requests.status` state machine plus a `service_request_approvals` audit/log table — following the same shape as the admissions module, not a shared generic engine (none exists to reuse, and building one is out of scope for the value delivered).

### 3.4 PDF/document generation — reuse Dompdf pipeline
`DocumentHelper.php` centralizes HTML template building for `admission_letter`, `to_whom_visa`, `registration_form`, `english_proficiency`, `completed_modules`, `exemption_letter`; `DegreePdf.php` handles degree certificates; `AdmissionLetterPdf.php` shows the canonical pattern: `buildHtml()` → `streamPdf()` (browser download) / `renderPdfBinary()` (email attachment), using Dompdf with a stamped header/QR (`PdfLayout::stampHeader()`). `DocumentController::ALLOWED_TYPES` whitelists document types centrally, with a `preview()` (HTML, for iframe) vs. binary-download split.

**Implication:** add new document types per service (or one generic "service letter" template with placeholders) following the exact same preview/generate/stream split — no new PDF library or rendering path needed.

### 3.5 Frontend routing — public + login-gated pattern already exists
`frontend/src/App.tsx` declares public routes (`/apply`, `/apply/track`, `/verify/student`, `/login`, etc.) **before** the `<ProtectedRoute>` wrapper; components live in `frontend/src/pages/public/`. `ApplicantAuthGate.tsx` is the existing "you must log in/register to continue" interstitial used by the admissions flow. Authenticated pages sit under `<ProtectedRoute>` + `<MainLayout>`, permission-gated via `requiredPermissions={PERMISSIONS.X}`.

**Implication:** this feature's public catalog + detail pages are new routes under `pages/public/`; the "log in to submit" gate reuses `ApplicantAuthGate.tsx` (or a student-scoped variant); the request form/tracking after login can live under `pages/student/` (or `pages/applicant/` if non-enrolled public users are also allowed to request some services — see open question in §6).

### 3.6 Audit trail — hook into SystemLogService like every other module
`SystemLogService::log(action, module, description, entityId?, entityType?, metadata?, actor?)` writes to `system_logs` (migration `035`), never throws, and is called inline after every mutating action elsewhere (`RoleController.php`, `FeeController.php`). Action vocabulary already includes `APPROVE|REJECT|GENERATE`; module vocabulary would need one new value, e.g. `SERVICE_REQUESTS`.

### 3.7 Migrations
Numbered `YYYY_MM_DD_NNN_description.sql` in `backend/database/migrations/` (the top-level `backend/migrations/` folder is stale/legacy — do not use it). Latest applied: `2026_07_21_109_import_payment_calendar_data.sql`. New migrations for this feature should start at **`2026_07_21_110_...`** (or later, checked against `MigrationService`/`run_migrations.php` at implementation time).

---

## 4. Proposed Architecture

### 4.1 Dynamic Service Catalog

```sql
service_catalog (
  id, code UNIQUE, name, slug UNIQUE, category,
  short_description, full_description, requirements JSON,      -- e.g. required docs, eligibility text
  required_attachments JSON,          -- [{key, label, mime_types, max_size_kb, required:bool}]
  document_template_type,            -- maps to DocumentHelper/new helper builder
  fee_amount, fee_currency DEFAULT 'RWF',
  requires_payment BOOLEAN DEFAULT true,
  payment_stage ENUM('after_final_approval','before_review') DEFAULT 'after_final_approval', -- see §2 decision
  processing_sla_days,
  is_active BOOLEAN DEFAULT true,
  created_by, updated_by, timestamps
)
```

### 4.2 Configurable Multi-Stage Approval Chain (per service)

Rather than hardcoding "Role 1 / Role 2 / Role 3", make the number and identity of stages **data**, so different services can have 1–4 stages, and the same institution can add a "Dean" stage to one service without touching code:

```sql
service_catalog_stages (
  id, service_id FK, stage_order INT,              -- 1, 2, 3...
  stage_key,                                        -- 'review_l1' | 'review_l2' | 'final_approval' | 'payment'
  stage_label,                                      -- "Registrar Review", "HOD Approval", etc.
  required_permission_slug,                         -- e.g. 'approve_service_request_l1'
  stage_type ENUM('approval','payment') DEFAULT 'approval',
  is_final_approval BOOLEAN DEFAULT false,
  sla_hours,
  UNIQUE(service_id, stage_order)
)
```
The **payment step is modeled as a stage** (`stage_type = 'payment'`) with `stage_order` placed either last (approve-then-pay, this request's default) or right after submission (pay-then-process, Irembo's model) — purely a data change per service, no code branch needed.

### 4.3 Request Lifecycle

```sql
service_requests (
  id, request_code UNIQUE,          -- public tracking number, e.g. SR-2026-000123
  service_id FK,
  requester_type ENUM('student','applicant','public'),
  student_regnumber NULL, national_id NULL, full_name, phone, email,
  form_data JSON,                    -- dynamic fields per service
  current_stage_order INT,
  status ENUM(
    'draft','submitted','in_review','changes_requested',
    'approved','rejected','awaiting_payment','paid',
    'completed','cancelled','expired'
  ) DEFAULT 'draft',
  invoice_id NULL FK fee_invoices,   -- reuse existing invoice model, fee_type='service_request'
  document_generated_at NULL,
  download_token NULL,              -- one-time/expiring signed token, like admission letter QR pattern
  downloaded_at NULL, download_count INT DEFAULT 0,
  submitted_at, completed_at, timestamps
)

service_request_attachments (
  id, service_request_id FK, attachment_key, file_path, original_name, uploaded_at
)

service_request_approvals (            -- audit log, mirrors ApplicationService::logStatusChange()
  id, service_request_id FK, stage_order, stage_key,
  actor_id, actor_name, actor_role,
  decision ENUM('approved','rejected','changes_requested','payment_confirmed'),
  comment NULL, decided_at
)
```

State machine (approve-then-pay default):
```
draft → submitted → in_review (stage 1) → in_review (stage 2) → in_review (stage 3/final)
      → approved → awaiting_payment → paid → completed
(any in_review stage can branch to: changes_requested → submitted, or rejected → terminal)
```

### 4.4 Payment Gate Reusing UrubutoPay
1. On entering `awaiting_payment`, create a `fee_invoices` row (`fee_type = 'service_request'`, amount from `service_catalog.fee_amount`) and call the existing `UrubutoPayService::generateCheckoutUrl()`-style method with a new `service_code` (extend `SERVICE_MAP`).
2. Existing webhook (`UrubutoPayController::paymentCallback`) already calls `recordMobilePayment()` — extend it to also flip `service_requests.status → 'paid'` when the invoice's `fee_type = 'service_request'`, then trigger document generation.
3. Download endpoint checks `status IN ('paid','completed')` before streaming — everything before that returns 402/403.

### 4.5 Document Generation & Secure Download
- Add a `ServiceRequestDocumentHelper` (or extend `DocumentHelper`) following `AdmissionLetterPdf`'s exact `buildHtml()` / `streamPdf()` / `renderPdfBinary()` shape, templated per `service_catalog.document_template_type`.
- Generate once, on `paid` transition (not lazily on every download) and cache the binary or path; store `document_generated_at`.
- Download endpoint validates `download_token` (short-lived signed token bound to the request + requester identity) to prevent link-sharing, and logs every download via `SystemLogService::log('GENERATE', 'SERVICE_REQUESTS', ...)`, incrementing `download_count`.

### 4.6 RBAC Additions
New permission slugs (added like `2026_07_15_095_rbac_phase0_finance_slugs.sql` did for finance):
`manage_service_catalog`, `submit_service_request` (student), `approve_service_request_l1`, `approve_service_request_l2`, `approve_service_request_final`, `view_service_requests`, `void_service_request`.
No new role *names* are required — the university assigns these slugs to whatever roles it already has (Registrar, HOD, Dean, Finance), consistent with how RBAC already works here.

### 4.7 Frontend Routes
```
Public (frontend/src/pages/public/services/):
  /services                     — catalog (cards/list, filter by category)
  /services/:slug               — service detail (description, requirements, fee, SLA) — no auth
  /services/:slug/apply         — hits ApplicantAuthGate-style login/register gate, then request form
  /services/track               — public tracking by request_code + national_id/phone (mirrors /apply/track)

Student-authenticated (frontend/src/pages/student/service-requests/):
  /my/service-requests           — list + status of own requests
  /my/service-requests/:id       — detail, pay button (redirect to UrubutoPay checkout), download button (enabled once paid)

Staff-authenticated (frontend/src/pages/service-requests/ under existing dashboard):
  /service-requests/queue        — permission-gated per stage (approve_service_request_lN), approve/reject/request-changes actions
  /service-requests/catalog      — manage_service_catalog: CRUD services + stage config
```

### 4.8 Audit Logging
Call `SystemLogService::log()` at: submission, each stage decision, payment confirmation, document generation, and every download — module `SERVICE_REQUESTS`, actions `CREATE|APPROVE|REJECT|GENERATE` per the existing vocabulary (no new action verbs needed).

---

## 5. Migration Plan (draft numbering, starting after `2026_07_21_109`)

| # | File | Purpose |
|---|---|---|
| 110 | `create_service_catalog_tables.sql` | `service_catalog`, `service_catalog_stages` |
| 111 | `create_service_requests_tables.sql` | `service_requests`, `service_request_attachments`, `service_request_approvals` |
| 112 | `service_requests_rbac_slugs.sql` | new permission slugs + seed into `permissions`/`permission_categories` |
| 113 | `service_requests_fee_type.sql` | add `service_request` to `fee_invoices.fee_type` enum/lookup, extend UrubutoPay `SERVICE_MAP` config row if DB-backed |

(Exact numbers must be re-checked against whatever has merged to `main`/`emmy` by implementation time — the sequence is not globally unique across date-branches per §3.7.)

---

## 6. Open Decisions for the University / Product Owner

1. **Payment timing policy** (§2): confirm approve-then-pay (as stated) vs. pay-then-process (Irembo's actual model) — the schema supports either per-service, but the default behavior and refund policy differ.
2. **Who can request services** — students only, or also applicants/alumni/general public (`requester_type` already modeled as `student|applicant|public` to leave this open)?
3. **Number of approval stages per service** — is 3 approval stages + payment a fixed rule for all services, or does it vary (e.g. some documents need only Registrar sign-off, others need Registrar → HOD → Dean)? The stage table supports variable counts; worth confirming so the admin UI for configuring a new service exposes "add stage" rather than a fixed 3-slot form.
4. **Rejection/changes-requested UX** — should a rejected request allow resubmission (new request) or in-place correction and re-submission of the same request?
5. **Document validity/re-download** — should a paid, completed request remain downloadable indefinitely, or expire/require a fresh request after N days (relevant for things like "current enrollment" letters that go stale)?

---

## 7. Suggested Phased Rollout

1. **Phase 1 — Catalog & RBAC:** `service_catalog` + `service_catalog_stages` tables, admin CRUD UI, permission slugs.
2. **Phase 2 — Public browse + submission:** public catalog/detail pages, student login gate, request form + attachment upload, `service_requests` creation.
3. **Phase 3 — Approval queue:** staff dashboard queue per stage, approve/reject/request-changes actions, `service_request_approvals` logging.
4. **Phase 4 — Payment + document:** UrubutoPay `SERVICE_MAP` extension, invoice creation on `awaiting_payment`, webhook wiring, document generation on `paid`, gated download endpoint.
5. **Phase 5 — Public tracking + polish:** `/services/track` page, SLA countdown display, notifications (email/SMS) on stage transitions — reusing whatever notification mechanism the admissions module already uses, if any.
