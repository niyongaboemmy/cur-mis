# HANDOFF

## Current Task
Fix the 9 defects reported in `FIX.pdf` (QA test report, 14 Aug 2026) — all in the
Student / Applicant portal.

## Status
**Solved** — all 9 addressed. 5 root causes were reproduced empirically against the
live local stack; the rest were traced in code and verified by targeted harnesses,
`tsc --noEmit`, and a production `vite build`.

## Progress
- [x] #1 Profile picture upload → "File storage service error (401)" surfaced as 422
- [x] #2 Cascading location dropdowns (Province → District verified; lower levels pending data)
- [x] #3 Notification bell in header did nothing
- [x] #4 Applicants could skip required documents
- [x] #5 Change password → 500 Internal Server Error
- [x] #6 National ID / Passport upload rejected as "invalid file type"
- [x] #7 Fines invisible and unpayable in My Finance
- [x] #8 Payment calendar dates unclear / looked outdated
- [x] #9 Admin could not view the proof-of-payment document

## Working Notes

### Root causes (all confirmed)
| # | Root cause | Fix |
|---|---|---|
| 1 | File server rejected the backend's `X-API-Key`; the upstream 401 was rethrown to the browser as a **422**, blaming the user's file | New `FileServerException` splits client (422) vs upstream (502); config validated up front; real cause logged |
| 5 | `AuthService::changePassword()` used `UserModel::find()`, which runs `hideFields()` and **strips `password`** → `password_verify(..., null)` → `TypeError` → 500 | Use `findBy('id', …)` (returns the raw row) |
| 6 | `service_catalog.mime_types` stores **extensions** (`["pdf","jpg"]`) but the check compared a **MIME type** (`application/pdf`) — could never match, so every upload 422'd | Normalise both sides to canonical extensions |
| 7 | `FinesController::createFine()` resolved the academic year with `ORDER BY id DESC` → picked the **"Legacy"** year (id 4), not `is_current` (id 2, 2025/2026). The fine's invoice was filed under a year My Finance never queries | Use `WHERE is_current = 1` with a `start_date DESC` fallback; added `GET /api/finance/my/fines` |
| 9 | `submitInvoicePayment()` uploaded the proof file but **never persisted `payment_slip_file_id`** — the id was returned to the client and discarded | Persist `payment_slip_file_id` + `payment_slip_mime`; the admin viewer already existed and now works |
| 3 | Rows were written to `notifications` but **no endpoint ever read them**; the header button was a decorative `RoundIconBtn` with a hardcoded dot and no `onClick` | New `NotificationController` + `/api/notifications` routes + `NotificationBell` |
| 4 | `STEP_FIELDS` has no entry for step 4, so `goNext()` waved the Documents step through | Gate `goNext()` + the step rail + the button; server-side gate in `submitApplication()` |
| 8 | Dates were *correct* (AY 2025/2026 legitimately starts 01/09/2025) but unlabelled and undifferentiated | Show academic year, split Upcoming vs Payment history, status chips |
| 2 | No structured location data anywhere — all free text | `rwandaLocations.ts` (5 provinces, 30 districts) + cascading `LocationSelect` |

### Deliberate scope decision on #2
Only Province + District ship as verified dropdowns (user-approved). Sector / Cell /
Village remain free text because bundling an approximated list of 416 sectors /
2,148 cells / ~14,837 villages would be worse than free text — a dropdown missing a
user's real sector *prevents* correct entry. `LocationSelect` flips a level to a
dropdown automatically once `SECTORS` / `CELLS` / `VILLAGES` in
`frontend/src/data/rwandaLocations.ts` are populated from the official RGB/NISR
dataset. **No code change needed to enable them.**

### Environment issues found — NOT fixed (need an operator decision)
1. **Storage URL — fixed locally, still to verify in production.** After the code
   fixes, photo upload still returned the new 502. Cause: `backend/.env` had
   `FILE_SERVER_URL=http://localhost:8888/...` (nothing listening) while the file
   server runs on **`:9001`** (`start-fileserver.bat`); the chain is
   frontend `:5180` → Vite proxy → backend `:9000` → storage `:9001`. Keys matched;
   only the URL was wrong. Corrected to `http://127.0.0.1:9001` and upload verified
   end to end (POST 200, GET returns a byte-identical PNG).
   `.env` is gitignored, so **production must be checked separately**:
   `GET /api/health?deep=1` must report `{"configured":true,"reachable":true}`.
   Added `backend/.env.example` documenting the correct URL for each serving mode
   (php -S `:9001`, Apache, cPanel).
2. **The local `curac_save` DB has no PRIMARY KEYs and no AUTO_INCREMENT** on
   `users`, `notifications`, `fee_fines`, `fee_invoices`, … Consequences seen live:
   duplicate `users.id` values, and a real applicant who registered on 17 Aug got
   `id = 0`. New registrations will keep colliding until the constraints are restored.
3. **`fee_invoices.created_by` is `NOT NULL`**, but `FinesController::createFine()`
   passes `$actor['id'] ?? null` — a fine issued without a resolvable actor fatals.
4. **3 pre-existing TypeScript errors** in `frontend/src/pages/admin/admissions/OffersPage.tsx`
   (lines 206, 215, 274 — `Expected 1 arguments, but got 2`), from commit `33ffdab`.
   Untouched by this work.
5. `GateManagementController.php:77,300` and `DeliberationController.php:60` use the
   same `academic_years ORDER BY id DESC` anti-pattern fixed in #7. Left alone —
   outside the student-portal scope of this report.

### Next step on resume
Nothing outstanding for the 9 reported issues. If continuing: obtain the official
sector/cell/village dataset and populate `rwandaLocations.ts` to complete #2, and
have an operator work through the environment list above.

## Recently Completed
- Fixed all 9 issues from `FIX.pdf` (student portal QA report).
