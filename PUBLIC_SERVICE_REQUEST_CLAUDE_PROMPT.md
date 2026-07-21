# Claude Code Implementation Prompt — Public Service Request Platform

Copy everything below the line into a Claude Code session (in this repo, on a feature branch off `emmy`) to execute the build. It is self-contained: it names its own source-of-truth docs, states constraints, and defines phase-by-phase acceptance criteria so Claude Code can work autonomously and verify its own output before moving on.

---

## PROMPT (copy from here)

You are implementing a new feature in this repository: a public, IremboGov-style **service request platform** — students browse a catalog of institutional services, log in to request one, the request passes through a configurable multi-role approval chain, and the generated document is only downloadable after payment is confirmed.

Two design documents already exist in the project root and are your source of truth. **Read both in full before writing any code:**
1. `PUBLIC_SERVICE_REQUEST_RESEARCH.md` — architecture rationale, schema design, Irembo research findings, and the open policy decisions.
2. `PUBLIC_SERVICE_REQUEST_IMPLEMENTATION_PLAN.md` — the concrete build plan: exact tables, exact files to create/modify, exact route/controller/service shapes, and a 7-phase build order with a checklist per phase.

Treat the implementation plan as authoritative for *how* to wire things into this specific codebase (route registration, migration runner, `BaseController` helpers, `FileServerClient` upload pattern, `UrubutoPayService` extension point, frontend `api.ts`/`ProtectedRoute` conventions). If you find the plan's assumption about a file/pattern is stale or wrong once you actually read the code, say so and adjust — don't force the plan's shape onto code that has since changed.

### Ground rules

- **Follow this repo's actual conventions, not generic MVC assumptions.** Before writing a new controller/service/model, open one real existing analog named in the implementation plan (e.g. `ApplicationService.php`, `AdmissionLetterPdf.php`, `RolesManagementPage.tsx`, `admissionService.ts`) and mirror its shape, naming style, and error-handling approach. Do not introduce a new architectural pattern (e.g. a generic workflow engine, a new HTTP client, a new PDF library, a new state-management approach) when an existing one already does the job.
- **Migrations**: before creating any `.sql` file, run `php backend/scripts/migrate.php --status` to find the true current migration head — the numbers `110`–`113` in the plan were correct at planning time but may be stale now. Number your new migrations starting one past whatever is actually latest. Apply them with the real runner (`php backend/scripts/migrate.php`), never the legacy `run_migrations.php`/`migrate_all.php`.
- **RBAC is data, not code.** Add new permission slugs via a migration (`INSERT` into `permissions`/`permission_categories`), and gate routes/pages by permission slug — never by hardcoded role name (the one existing exception, `ApplicantMiddleware`, is legacy; do not copy that pattern for this feature).
- **Reuse `UrubutoPayService` and `FileServerClient` — do not stand up a second payment or upload path.** The plan identifies `UrubutoPayController::paymentCallback()` as the one existing file that needs a new conditional branch; everything else in the payment path should be additive (new `SERVICE_MAP` entry, new method), not a parallel implementation.
- **State machine discipline.** Mirror `ApplicationService.php`'s `$allowedStatuses` + `logStatusChange()`-style audit-log pattern exactly for `service_requests`. Every status transition must be (a) validated against an explicit whitelist and (b) written to `service_request_approvals` (or the submission-time equivalent) before returning success.
- **Audit everything mutating** via `SystemLogService::log()`, module `'SERVICE_REQUESTS'`, using the existing action vocabulary (`CREATE|APPROVE|REJECT|GENERATE`) — no new action verbs.
- **No comments explaining WHAT code does.** Only comment non-obvious WHY (e.g. why a webhook branch exists, why a token is short-lived). Keep functions small and consistent with the file you're mirroring.
- **Security**: validate file upload extensions/sizes before calling `FileServerClient`; the download endpoint must check both request `status` (`paid`/`completed`) and a signed, short-lived `download_token` bound to the requester's identity — never allow download by request-ID guessing alone. Payment webhook handling must remain behind the existing `UrubutoPayWebhookMiddleware`; do not weaken or bypass it.
- **Resolve open decisions before you need them, don't block on them.** Section 6 of the research doc lists 5 open product decisions (payment timing policy, who can request services, fixed vs. variable stage count, resubmission UX, document expiry). Where the implementation plan already picked a sane default (e.g. approve-then-pay, `requester_type` enum left open, variable stage count via `service_catalog_stages`), proceed with that default and note the assumption in your final summary rather than stopping to ask — these are all reversible schema-level choices, not one-way doors.

### Required working method

1. **Plan first.** Before writing code, produce a short internal task list (use your todo-tracking tool) that mirrors the 7 phases in `PUBLIC_SERVICE_REQUEST_IMPLEMENTATION_PLAN.md` §8. Work phase by phase, in order — do not start Phase 3 (public submission) before Phase 1 (data/permissions) and Phase 2 (admin catalog CRUD) are working, since Phase 3 needs at least one real service row to submit against.
2. **After each phase, verify it actually works before moving on** — this is a runtime feature (state machine + payment webhook + file upload), not something type-checking alone can validate. Concretely:
   - Phase 1: query the new tables directly, confirm the migration applied cleanly and permission rows exist.
   - Phase 2: exercise the admin UI (or the API directly) to create a service with 3 stages, confirm it round-trips.
   - Phase 3: submit a real request as a test student account through the actual UI, confirm the row lands with the right initial status and the attachment made it to the file server.
   - Phase 4: use 3 different staff test accounts, each holding exactly one stage permission, and confirm each only sees their own stage in the queue, and that approving advances `current_stage_order` correctly.
   - Phase 5: confirm an invoice is created on entering `awaiting_payment`, and that a webhook call (real sandbox or a manually-crafted POST matching the real payload shape) flips status to `paid`.
   - Phase 6: confirm download is blocked (402/403) before payment and succeeds after, and that `system_logs` rows appear for generation and every download.
   - Phase 7: run the full path end-to-end once — anonymous browse → login → submit → all approval stages → pay → download → public tracking page shows "Completed" — and fix anything that breaks in the seams between phases.
3. **Use the project's `/verify` skill** (or equivalent manual browser-driven check if that skill doesn't apply cleanly here) after Phases 3, 4, 5, and 6 specifically — those are the phases with real user-facing runtime behavior (form submission, approval actions, payment redirect, gated download) that a passing test suite would not by itself prove works.
4. **If UrubutoPay sandbox credentials/service codes are not available**, say so explicitly rather than silently faking success — implement the webhook branch and checkout-URL generation, but flag that end-to-end payment confirmation needs a real or stubbed webhook call to fully verify, and propose the exact `curl`/test payload you'd use to simulate it.
5. **Stop and ask** only if you hit something genuinely ambiguous that isn't covered by the two design docs or by an existing code pattern you can mirror (e.g. a business rule about refunds, or a UI copy/branding decision) — don't ask about implementation details that the plan already answers.

### Definition of done

- All 4 migrations (or however many the true current schema needs) applied cleanly, confirmed via `php backend/scripts/migrate.php --status`.
- A superadmin can create/edit/deactivate a service with a configurable number of approval stages through the admin UI.
- An anonymous visitor can browse the public catalog and read a service's details without logging in.
- Clicking "Apply" on a service detail page prompts a student login/registration before the request form appears.
- A submitted request visibly advances through each configured approval stage, is only actionable by staff holding that specific stage's permission, and every decision is logged in `service_request_approvals`.
- On final approval, the student can pay through the existing UrubutoPay checkout flow, and the request flips to `paid` on webhook confirmation.
- The generated PDF is downloadable only after payment, via a token-gated endpoint, with every generation and download recorded in `system_logs`.
- A member of the public can look up a request's coarse status via `/services/track` using the request code + identifier, without needing to log in.
- No parallel payment gateway, upload mechanism, or PDF library was introduced — everything composes the existing `UrubutoPayService`, `FileServerClient`, and Dompdf pipeline.
- End of your work: give me a concise summary of what was built, which of the 5 open product decisions you defaulted on and why, anything you couldn't fully verify (e.g. real payment webhook), and any deviation you made from the implementation plan because the actual code no longer matched its assumptions.

---
