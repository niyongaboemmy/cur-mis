# CUR MIS — Registry Requirements: Detailed Development Tasks

> Source: Proposition from the Academic Registrar, 22 April 2026  
> Generated: 2026-05-16  
> Codebase: PHP 8 MVC backend + React/TypeScript/Vite frontend

This document maps every registry team requirement to actionable development tasks, clearly noting what already exists in the system and exactly what must be built or changed. Tasks are grouped by the 5 student lifecycle stages described in the requirements document.

---

## How to Read This Document

Each task entry contains:
- **Status** — `EXISTS` (feature is already in the system), `PARTIAL` (partially built), `MISSING` (needs to be built from scratch)
- **What exists** — Current relevant code/tables
- **What to build** — Specific implementation steps
- **Files to change** — Backend controllers/models/migrations and frontend pages/components

---

---

# STAGE 1 — CANDIDATES APPLY

---

## TASK 1.1 — Campus-Based Task Assignment for Registry Assistants

**Status:** `PARTIAL`  
**Priority:** High

**Requirement:** Each campus (Kigali, Huye–Save) should be treated as an independent entity for processing admissions. Registry assistants should be flexibly assigned to one or more campuses, and an assistant should see only the applications belonging to their assigned campus(es). More than one assistant can be assigned to the same campus. A shared visible note must be recordable per pending candidate so all concerned staff can see why they are being held.

**What already exists:**
- `campuses` table with `id, name, code, is_active` — `CampusModel`
- `option_campuses` junction table linking programs/options to campuses
- `student_applications.campus_id` FK — applications already carry campus information
- `ApplicationsListPage.tsx` has existing filter controls

**What to build:**

1. **DB Migration — user–campus assignments table**
   ```sql
   CREATE TABLE user_campus_assignments (
     id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     user_id INT UNSIGNED NOT NULL REFERENCES users(id),
     campus_id INT UNSIGNED NOT NULL REFERENCES campuses(id),
     assigned_by INT UNSIGNED REFERENCES users(id),
     assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     UNIQUE(user_id, campus_id)
   );
   ```

2. **DB Migration — application pending notes**
   ```sql
   CREATE TABLE application_pending_notes (
     id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     application_id INT UNSIGNED NOT NULL REFERENCES student_applications(id),
     note TEXT NOT NULL,
     created_by INT UNSIGNED REFERENCES users(id),
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

3. **Backend — UserController**: Add `assignCampus()` and `revokeCampus()` methods; add `GET /api/users/:id/campuses` and `POST/DELETE /api/users/:id/campuses/:campus_id` routes. Require `MANAGE_USERS` permission.

4. **Backend — ApplicationAdminController**: In the `index()` method, if the authenticated user has campus assignments (and is not a superadmin), automatically apply a `WHERE campus_id IN (...)` filter so the user only sees their campus(es). Admins with no campus assignment see all.

5. **Backend — ApplicationAdminController**: Add `addPendingNote(id)` POST endpoint at `/api/admin/applications/:id/pending-notes` and `listPendingNotes(id)` GET endpoint.

6. **Frontend — UsersManagementPage.tsx**: Add a "Campus Assignments" section in the user edit modal/drawer where admins can assign/remove campuses.

7. **Frontend — ApplicationsListPage.tsx**: Display the pending notes panel inline on each pending application row. Add a "Add Note" button. Notes are visible to all registry staff regardless of campus.

**Files to change:**
- `backend/database/migrations/` — 2 new migration files
- `backend/app/Controllers/UserController.php` — new campus assignment methods
- `backend/app/Controllers/ApplicationAdminController.php` — campus scoping in index(), new pending note methods
- `backend/routes/api/users.php` — new campus routes
- `backend/routes/api/applications.php` — new pending note routes
- `frontend/src/pages/admin/UsersManagementPage.tsx`
- `frontend/src/pages/admin/admissions/ApplicationsListPage.tsx`
- `frontend/src/services/userService.ts` — new campus API calls
- `frontend/src/services/admissionService.ts` — new pending note API calls

---

## TASK 1.2 — Remove the 6 Principal-Pass Limit

**Status:** `PARTIAL`  
**Priority:** Medium

**Requirement:** Allow applicants to record more than 6 principal passes in their academic history (A-Level or equivalent).

**What already exists:**
- `applicant_academic_records` table — each row is one academic record; there is no hard DB limit
- `ApplicantProfileController.addAcademicRecord()` — handles insertion
- The limit is enforced in the frontend application form (`frontend/src/pages/public/ApplyPage.tsx`) where the UI caps the number of records a user can add

**What to build:**

1. **Frontend — ApplyPage.tsx**: Locate the constant or condition that caps academic record entries at 6. Remove or raise the cap (no business-logic maximum; let applicants add as many as they actually have). Ensure the dynamic list renders correctly beyond 6 entries without layout breakage.

2. **Backend — ApplicantProfileController & ApplicationPortalController**: Audit any validation that rejects more than N academic records. Remove or raise any such server-side guard.

3. **Frontend — ApplicationDetailPage.tsx** (admin view): Ensure the academic records display section scrolls/expands correctly when more than 6 records are present.

**Files to change:**
- `frontend/src/pages/public/ApplyPage.tsx` — remove 6-entry cap
- `backend/app/Controllers/ApplicantProfileController.php` — audit validation
- `backend/app/Controllers/ApplicationPortalController.php` — audit validation
- `frontend/src/pages/admin/admissions/ApplicationDetailPage.tsx` — display fix

---

## TASK 1.3 — Video Guidance Links in Application Portal

**Status:** `MISSING`  
**Priority:** Medium

**Requirement:** Two video links must be embedded in the applicant-facing portal:
1. A video explaining the entire application process (including how to use the application code to upload registration fees).
2. A video guiding admitted students on how to log in, use their username/registration number, and reset their password.

**What already exists:**
- `settings` table (`SettingModel`) — key/value store that can hold configurable values
- `SystemBasicsController` — exposes system settings to the frontend via `GET /api/system/basics`

**What to build:**

1. **Backend — SettingModel / SystemBasicsController**: Extend `GET /api/system/basics` to include two new settings keys: `video_application_guide_url` and `video_login_guide_url`. Add `update()` handling for these keys in the admin settings endpoint.

2. **Frontend — AcademicSettingsPage.tsx** (or a new System Settings tab): Add two URL input fields under a "Guidance Videos" section so an admin can paste and save both video URLs.

3. **Frontend — ApplyPage.tsx** (public application portal): Fetch the `video_application_guide_url` from `/api/system/basics` and render a visible "Watch: How to Apply" link/button (opens in new tab or embedded modal) at the top of the application form.

4. **Frontend — ApplicantOverviewPage.tsx** (authenticated applicant dashboard): Render a "Watch: How to Log In & Reset Password" link using `video_login_guide_url`.

5. **Frontend — LoginPage.tsx**: Show the login-guide video link as a small helper link below the login form.

**Files to change:**
- `backend/app/Controllers/SystemBasicsController.php`
- `backend/app/Models/SettingModel.php`
- `backend/routes/api/system.php`
- `frontend/src/pages/academic/AcademicSettingsPage.tsx` (or system settings)
- `frontend/src/pages/public/ApplyPage.tsx`
- `frontend/src/pages/applicant/ApplicantOverviewPage.tsx`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/services/academicService.ts` — include video URLs in basics response

---

## TASK 1.4 — Fix Registration Number Conflicts for Returning Students (Masters)

**Status:** `MISSING`  
**Priority:** High

**Requirement:** Students who previously graduated from CUR (Undergraduate) and are now applying for a Masters program cannot be admitted because their registration number already exists in the system. The system must handle this case so returning students can receive a new registration number for their postgraduate programme.

**What already exists:**
- `student` table with `regnumber` as a unique identifier
- `admission_offers` table with `student_id FK` — links an offer to a student record
- `AdmissionController.initiateEnrollment()` — creates a student record on enrollment

**What to build:**

1. **DB Migration**: Add a `parent_student_id` nullable FK column to the `student` table so a postgraduate record can reference the prior undergraduate record.
   ```sql
   ALTER TABLE student ADD COLUMN parent_student_id INT UNSIGNED NULL REFERENCES student(id);
   ALTER TABLE student ADD COLUMN programme_level ENUM('undergraduate','pgde','masters','diploma') DEFAULT 'undergraduate';
   ```

2. **Backend — ApplicationService / AdmissionController**: During enrollment (`initiateEnrollment()`), before creating a new student row, search `student` for an existing record matching the applicant's email or national ID. If found, create a **new row** (new registration number) rather than rejecting with a duplicate-key error. Set `parent_student_id` to the existing row's ID. The student will then have two rows — one per programme — each with its own registration number and programme level.

3. **Backend — StudentController**: When fetching a student's history (`show()`), join with `parent_student_id` to show prior programme records in the profile.

4. **Frontend — ApplicationDetailPage.tsx / OffersPage.tsx**: When enrolling an applicant who has an existing student record, show a confirmation dialog: "This applicant already has a student record (Reg: XXXXX). A new postgraduate record will be created alongside it." Require explicit confirmation before proceeding.

**Files to change:**
- `backend/database/migrations/` — new migration
- `backend/app/Controllers/AdmissionController.php`
- `backend/app/Services/ApplicationService.php`
- `backend/app/Controllers/StudentController.php`
- `frontend/src/pages/admin/admissions/OffersPage.tsx`
- `frontend/src/pages/admin/admissions/ApplicationDetailPage.tsx`

---

## TASK 1.5 — Program–Campus Association (Prevent Wrong Campus Selection)

**Status:** `PARTIAL`  
**Priority:** High

**Requirement:** Programs must be bound to the campus(es) where they are physically offered. Applicants must only be able to select a campus that actually hosts their chosen program, preventing them from choosing health programs at Kigali if those programs are only at Huye–Save.

**What already exists:**
- `option_campuses` junction table links `options` to `campuses` ✓
- `ApplicationPortalController.getFacultyDepartments()` and `getPrograms()` exist ✓
- The junction table is populated but the public application portal may not filter programs by the selected campus

**What to build:**

1. **Backend — ApplicationPortalController.getPrograms()**: Modify to accept an optional `campus_id` query parameter. When provided, JOIN with `option_campuses` to return only programs/options that are offered at that campus.

2. **Frontend — ApplyPage.tsx**: When the applicant selects a campus, re-fetch the available programs filtered by that campus. If the applicant changes campus after selecting a program, warn them and reset the program selection if the previously chosen program is not available at the new campus.

3. **Backend — ApplicationPortalController** (validation on submit): Add server-side validation that the submitted `option_id` is indeed linked to the submitted `campus_id` in `option_campuses`. Reject with a clear error message if not.

4. **Frontend — AcademicsManagementPage.tsx** / options management: In the admin options editor, clearly display and allow editing of which campuses each option/program belongs to (uses existing `option_campuses` data but needs a UI to manage it).

**Files to change:**
- `backend/app/Controllers/ApplicationPortalController.php`
- `frontend/src/pages/public/ApplyPage.tsx`
- `frontend/src/pages/academic/AcademicsManagementPage.tsx`
- `frontend/src/services/admissionService.ts`

---

## TASK 1.6 — Fix "Pending But Already Admitted" Applicant Bug

**Status:** `MISSING` (bug fix)  
**Priority:** High

**Requirement:** Some applicants show as "pending" in the system even though they have already been admitted. This wastes registry time. The specific known case is Niyogisubizo Secondine (reg# 1CUR26AK012512, app ID 9814).

**What already exists:**
- `student_applications.status` state machine: `draft → submitted → ... → offered → offer_accepted → enrolled`
- `admission_offers.enrollment_initiated` boolean flag
- A student record exists in the `student` table for admitted students

**What to build:**

1. **Backend — Investigation script**: Write a diagnostic script (in `backend/scripts/`) that queries all `student_applications` with status not in `('enrolled', 'withdrawn')` but that have a matching record in the `student` table (matched by email or reg number). Output the list of inconsistent records.

2. **Backend — Data fix migration**: Write a migration that identifies these orphaned-pending cases and updates their `status` to `enrolled` and sets `enrollment_initiated = 1` on their `admission_offers` row.

3. **Backend — ApplicationService**: After every successful enrollment (`initiateEnrollment()`), add a final step that explicitly sets `student_applications.status = 'enrolled'` to prevent future desync. Add an assertion/check at the end of the enroll transaction to verify the status was updated.

4. **Frontend — ApplicationsListPage.tsx**: Add a warning banner for admin users: "There are X applications marked as pending that may already have student records. [Review]" (computed by the backend stats endpoint).

**Files to change:**
- `backend/scripts/diagnose_pending_enrolled.php` — new diagnostic script
- `backend/database/migrations/` — data-fix migration
- `backend/app/Services/ApplicationService.php`
- `backend/app/Controllers/ApplicationAdminController.php` — add count to stats
- `frontend/src/pages/admin/admissions/ApplicationsListPage.tsx`

---

## TASK 1.7 — Applicant Visibility Scoping (Masters / Campus Isolation)

**Status:** `MISSING`  
**Priority:** High

**Requirement:** Masters applicants must only appear in the Masters section of the admin panel. Kigali applicants must appear only in the Kigali list. Huye–Save applicants only in the Huye–Save list. The same scoping applies to both "New" and "Accepted" (offered) views.

**What already exists:**
- `student_applications.campus_id` and a `level_id` field exist in the applications table
- `ApplicationsListPage.tsx` has filter controls but they are optional, not enforced

**What to build:**

1. **Backend — ApplicationAdminController.index()**: Extend the query to support mandatory `campus_scope` and `level_scope` parameters. When a registry user has campus assignments (from Task 1.1), automatically apply `WHERE campus_id IN (user's campuses)`. Expose `level_id` as a mandatory visible segment (undergraduate / PGDE / Masters tabs).

2. **Frontend — AdmissionsHub.tsx / ApplicationsListPage.tsx**: Add top-level tab navigation: **Undergraduate | PGDE | Masters**, each with sub-tabs **Kigali | Huye–Save**. When a tab is selected, the list is filtered server-side. Users assigned to Kigali only see the Kigali tab.

3. **Backend — /api/admin/applications/stats**: Break down stats by level and campus so the dashboard shows counts per section.

**Files to change:**
- `backend/app/Controllers/ApplicationAdminController.php`
- `frontend/src/pages/admin/admissions/AdmissionsHub.tsx`
- `frontend/src/pages/admin/admissions/ApplicationsListPage.tsx`
- `frontend/src/services/admissionService.ts`

---

## TASK 1.8 — Advanced Applicant Filtering (Gender, Attendance Mode, Payment)

**Status:** `PARTIAL`  
**Priority:** Medium

**Requirement:** In addition to existing Faculty/Department/Option filters, add: consistent gender filter, attendance mode filter (full-time/part-time/distance), and a paid/unpaid payment status filter with paid cases surfaced at the top.

**What already exists:**
- `student_applications.gender` — field exists
- `student_applications.mode_of_study` (attendance mode) — field exists  
- `student_applications.payment_status` — field exists
- `ApplicationsListPage.tsx` has some filter UI

**What to build:**

1. **Backend — ApplicationAdminController.index()**: Add `gender`, `mode`, and `payment_status` as accepted query parameters. When `payment_status=paid` is selected, add `ORDER BY (payment_status = 'paid') DESC` so paid applications appear first.

2. **Frontend — ApplicationsListPage.tsx**: Add three new filter controls: a Gender select (Male/Female/Other), an Attendance Mode select (Full-Time/Part-Time/Distance), and a Payment Status select (All/Paid/Unpaid). The paid/unpaid filter should visually pin paid rows at the top (or use a "Sort: Paid First" toggle).

3. **Backend — Data consistency**: Write a migration to normalise any inconsistent gender values (e.g., 'M'/'F' vs 'Male'/'Female') to a single format.

**Files to change:**
- `backend/app/Controllers/ApplicationAdminController.php`
- `frontend/src/pages/admin/admissions/ApplicationsListPage.tsx`
- `backend/database/migrations/` — gender normalisation migration

---

## TASK 1.9 — Pending Timeout, Hide/Restore Button

**Status:** `MISSING`  
**Priority:** Medium

**Requirement:** Applicants who remain in the "pending" state for longer than a configured period should be automatically moved to a separate holding area. A button must let registry staff manually hide/restore any pending applicant from the main list without deleting them. Both new and accepted applicants can be hidden.

**What already exists:**
- `student_applications.status` state machine includes `pending` implicitly (submitted, under review)
- No `hidden` flag or `pending_expires_at` field exists

**What to build:**

1. **DB Migration**: 
   ```sql
   ALTER TABLE student_applications 
     ADD COLUMN is_hidden TINYINT(1) DEFAULT 0,
     ADD COLUMN hidden_at TIMESTAMP NULL,
     ADD COLUMN hidden_by INT UNSIGNED NULL REFERENCES users(id),
     ADD COLUMN pending_since TIMESTAMP NULL;
   ```

2. **Backend setting**: Add a configurable `pending_timeout_days` key in the `settings` table (default: 30 days).

3. **Backend — ApplicationAdminController**: Add `PATCH /api/admin/applications/:id/hide` and `PATCH /api/admin/applications/:id/restore` endpoints. Add a separate `GET /api/admin/applications/hidden` endpoint to list all hidden applications. In `index()`, add `WHERE is_hidden = 0` by default; pass `include_hidden=true` to see them.

4. **Backend — Scheduled check** (or trigger on list load): Identify applications where `pending_since` is older than `pending_timeout_days` and `is_hidden = 0`; automatically set `is_hidden = 1` (and log the action as a system event). This can be a script called by a cron job or run on each admin list load.

5. **Frontend — ApplicationsListPage.tsx**: Add a "Hide" button (eye-slash icon) on each pending/accepted row. Add a "Hidden Applicants" toggle or sub-tab that shows the hidden list with a "Restore" button per row.

**Files to change:**
- `backend/database/migrations/` — new migration
- `backend/app/Controllers/ApplicationAdminController.php`
- `backend/routes/api/applications.php`
- `backend/scripts/auto_hide_expired_pending.php` — cron script
- `frontend/src/pages/admin/admissions/ApplicationsListPage.tsx`
- `frontend/src/services/admissionService.ts`

---

## TASK 1.10 — Applicant Progress Dashboard & In-System Chat

**Status:** `PARTIAL`  
**Priority:** High

**Requirement:** Applicants should see a clear, step-by-step progress dashboard for their application inside the portal, eliminating the need to call or WhatsApp the registry. A two-way chat must allow registry staff to communicate with specific applicants inside the system.

**What already exists:**
- `ApplicantOverviewPage.tsx` shows some application status info ✓
- `TrackApplicationPage.tsx` (public, no auth) shows application tracking ✓
- `MessageController.php` + `MessagesPage.tsx` — full messaging system exists ✓
- `conversations` and `messages` tables exist ✓
- Applicant role exists (`is_applicant` flag on users)

**What to build:**

1. **Frontend — ApplicantOverviewPage.tsx**: Replace the current status display with a visual step-indicator component showing all stages: `Application Submitted → Documents Under Review → Documents Verified → Merit Listed → Offer Made → Offer Accepted → Enrolled`. The active stage is highlighted. Each completed stage shows a checkmark and the date it was reached (from `application_status_log`).

2. **Backend — ApplicationService / ApplicantProfileController**: Expose `GET /api/applicant/application/timeline` that returns the full `application_status_log` array for the authenticated applicant's application.

3. **Frontend — ApplicantOverviewPage.tsx**: Add a "Messages" card/section showing unread message count and a "Contact Registry" button that opens the messaging view.

4. **Backend — Messaging routes**: Currently messaging requires no specific role gate beyond auth. Ensure applicant users can access `GET /api/messages/conversations` and `POST /api/messages/conversations/:id/send`. Add middleware to allow `is_applicant = 1` users through.

5. **Frontend — New ApplicantMessagesPage.tsx** (or modal): A simplified messaging view for applicants — shows only conversations involving registry staff. Registry staff see applicant conversations in their existing `MessagesPage.tsx`.

6. **Frontend — ApplicationDetailPage.tsx** (admin): Add a "Message Applicant" button that opens a compose modal pre-addressed to the applicant user.

**Files to change:**
- `frontend/src/pages/applicant/ApplicantOverviewPage.tsx`
- `backend/app/Controllers/ApplicantProfileController.php` — add timeline endpoint
- `backend/routes/api/applicant.php` — new timeline route
- `frontend/src/pages/applicant/` — new ApplicantMessagesPage.tsx
- `backend/app/Middleware/` — audit messaging middleware for applicant access
- `frontend/src/pages/admin/admissions/ApplicationDetailPage.tsx`
- `frontend/src/services/admissionService.ts`

---

## TASK 1.11 — Credit Transfer / Upgrading Candidate Workflow

**Status:** `MISSING`  
**Priority:** High

**Requirement:** Applicants applying via credit transfer or upgrading must be flagged as such. The system must send a notification to the relevant faculty to prepare an exemption letter. Admission progress (specifically generating the admission letter) must be blocked until the exemption letter is marked as received by both registry and finance.

**What already exists:**
- `student_applications` has a `mode_of_study` field but no `credit_transfer` flag
- `AdmissionLetterPdf.php` exists and generates letters
- No exemption letter tracking exists

**What to build:**

1. **DB Migration**:
   ```sql
   ALTER TABLE student_applications 
     ADD COLUMN is_credit_transfer TINYINT(1) DEFAULT 0,
     ADD COLUMN credit_transfer_from VARCHAR(255) NULL,
     ADD COLUMN exemption_letter_status ENUM('not_required','pending','received_registry','received_finance','confirmed') DEFAULT 'not_required',
     ADD COLUMN exemption_letter_received_at TIMESTAMP NULL,
     ADD COLUMN entry_level_override VARCHAR(50) NULL COMMENT 'Registry-set entry level for credit transfer';
   ```

2. **Frontend — ApplyPage.tsx**: Add a "I am applying via Credit Transfer / Upgrading" checkbox. When checked, show an additional field: "Previous institution/programme". Set `is_credit_transfer = 1` on submission.

3. **Backend — ApplicationAdminController / ApplicationService**: When an application with `is_credit_transfer = 1` transitions to `documents_verified` status, automatically trigger a message (via `MailService`) to the relevant faculty dean with a standard exemption letter request. Log this action in `system_logs`.

4. **Backend — AdmissionController**: In `downloadLetter()` and `sendLetter()`, check if `is_credit_transfer = 1`. If so, check `exemption_letter_status`. If not `confirmed`, return an error: "Admission letter cannot be issued until the exemption letter is confirmed by both registry and finance."

5. **Backend — new exemption letter endpoint**: `PATCH /api/admin/applications/:id/exemption-status` — allows registry and finance staff to update `exemption_letter_status`. Registry confirms `received_registry`, finance confirms `received_finance`. When both are set, status auto-advances to `confirmed`.

6. **Frontend — ApplicationDetailPage.tsx**: For credit-transfer applications, show an "Exemption Letter" status panel with action buttons for registry and finance to confirm receipt. Also allow registry to set `entry_level_override`.

**Files to change:**
- `backend/database/migrations/` — new migration
- `backend/app/Controllers/AdmissionController.php`
- `backend/app/Controllers/ApplicationAdminController.php`
- `backend/app/Services/ApplicationService.php`
- `backend/routes/api/applications.php`
- `frontend/src/pages/public/ApplyPage.tsx`
- `frontend/src/pages/admin/admissions/ApplicationDetailPage.tsx`
- `frontend/src/services/admissionService.ts`

---

## TASK 1.12 — Bulk Applicant Upload via Template

**Status:** `MISSING`  
**Priority:** High

**Requirement:** Registry staff must be able to upload a populated Excel/CSV template to batch-admit applicants (direct-entry lists). After upload, the system should generate admission letters immediately. Uploaded students must have access to all the same academic documents and services as online applicants.

**What already exists:**
- `AcademicsManagementController.bulkImport()` — shows the pattern for bulk import
- `AdmissionController.manualAdmit()` — handles single manual admissions
- `ApplicationService` — creates applications programmatically

**What to build:**

1. **Backend — new endpoint**: `POST /api/admin/applications/bulk-upload` in `ApplicationAdminController`. Accepts a multipart file (XLSX or CSV). Parses each row, validates required fields, creates a `student_application` record per row with `status = 'enrolled'` directly (bypassing the public portal workflow), generates a student record, and triggers admission letter generation.

2. **Backend — template download endpoint**: `GET /api/admin/applications/bulk-upload-template` — returns a pre-formatted XLSX with correct column headers and example data.

3. **Backend — ApplicationService**: Add `bulkImportApplicants(array $rows)` method that wraps individual applicant creation in a transaction, collects errors per row, and returns a summary (success count, error rows with reasons).

4. **Frontend — OffersPage.tsx or new BulkUploadPage.tsx**: Add a "Bulk Upload" button that opens a modal with: (1) a "Download Template" link, (2) a file upload area, (3) a preview grid showing parsed rows before submission, (4) a confirmation button that submits. After submission, display a results summary (X succeeded, Y failed with reasons).

5. **Backend — Post-upload**: Each successfully uploaded applicant should have a `user` account created (if not already existing) so they can log in to the student portal.

**Files to change:**
- `backend/app/Controllers/ApplicationAdminController.php`
- `backend/app/Services/ApplicationService.php`
- `backend/routes/api/applications.php`
- `frontend/src/pages/admin/admissions/OffersPage.tsx` or new page
- `frontend/src/services/admissionService.ts`
- New composer library for XLSX parsing (e.g., `PhpSpreadsheet`)

---

## TASK 1.13 — International Students: Visa Tracking Module

**Status:** `MISSING`  
**Priority:** Medium

**Requirement:** International students must be tracked with: country of origin, Rwanda entry date, visa issue date, visa expiry date, and visa renewal history. The system should prevent international students from accessing certain features if their visa is expired, with a friendly warning. Students are assigned to a responsible registry assistant.

**What already exists:**
- `student.nationality` field — records nationality string
- No visa tracking fields or table exist
- User–campus assignment from Task 1.1 can be reused for user–student assignment

**What to build:**

1. **DB Migration**:
   ```sql
   CREATE TABLE student_visa_records (
     id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     student_id INT UNSIGNED NOT NULL REFERENCES student(id),
     country_of_origin VARCHAR(100) NOT NULL,
     entry_date DATE NOT NULL,
     visa_issue_date DATE NOT NULL,
     visa_expiry_date DATE NOT NULL,
     visa_type VARCHAR(100),
     created_by INT UNSIGNED REFERENCES users(id),
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     is_current TINYINT(1) DEFAULT 1
   );
   
   ALTER TABLE student ADD COLUMN assigned_registry_user_id INT UNSIGNED NULL REFERENCES users(id);
   ALTER TABLE student ADD COLUMN is_international TINYINT(1) DEFAULT 0;
   ```

2. **Backend — StudentController**: Add `GET /api/students/:id/visa`, `POST /api/students/:id/visa` (add renewal), and `PATCH /api/students/:id/visa/:visa_id` endpoints. Add `GET /api/students/international` to list all international students with their current visa status and days until expiry.

3. **Backend — StudentController.me()**: When an international student loads their portal, include their current visa status and a friendly warning if expiry is within 30 days or already past.

4. **Frontend — StudentDetailsPage.tsx**: Add a "Visa & Immigration" tab for international students showing all visa records and a "Add Renewal" button.

5. **Frontend — new InternationalStudentsPage.tsx**: A dedicated list view showing all international students with a "Days Until Visa Expiry" column, sortable and filterable by country and expiry status. Accessible to registry staff.

6. **Frontend — StudentDetailsPage.tsx**: "Assigned Registry Officer" dropdown — allows admin to set `assigned_registry_user_id` on the student record.

**Files to change:**
- `backend/database/migrations/` — new migration
- `backend/app/Controllers/StudentController.php`
- `backend/routes/api/students.php`
- `frontend/src/pages/StudentDetailsPage.tsx`
- `frontend/src/pages/admin/` — new InternationalStudentsPage.tsx
- `frontend/src/services/studentService.ts`

---

## TASK 1.14 — Applicant Statistics Report

**Status:** `PARTIAL`  
**Priority:** Medium

**Requirement:** A statistical table showing the number of new/accepted applicants, filterable by Faculty, Department, Option, Campus, and Attendance Mode, within a user-defined date range. Must cover all programme levels.

**What already exists:**
- `ApplicationAdminController.getDashboardStats()` returns some aggregate counts
- `AdminDashboardController.overview()` returns overall stats

**What to build:**

1. **Backend — new endpoint**: `GET /api/admin/applications/statistics` — Accepts query params: `faculty_id`, `department_id`, `option_id`, `campus_id`, `mode`, `date_from`, `date_to`, `level_id`. Returns a breakdown table: rows = Faculty/Department/Option, columns = new count, accepted/offered count, enrolled count, withdrawn count.

2. **Frontend — new ApplicationStatisticsPage.tsx** under admissions hub: A filter bar at the top (date range picker, faculty/dept/option/campus/mode dropdowns) and a sortable table below. An "Export to CSV" button generates a downloadable report.

3. **Router**: Add route `/admin/admissions/statistics` → `ApplicationStatisticsPage`.

**Files to change:**
- `backend/app/Controllers/ApplicationAdminController.php` — new statistics endpoint
- `backend/routes/api/applications.php`
- `frontend/src/pages/admin/admissions/` — new ApplicationStatisticsPage.tsx
- `frontend/src/pages/admin/admissions/AdmissionsHub.tsx` — new nested route
- `frontend/src/services/admissionService.ts`

---

---

# STAGE 2 — CANDIDATES ADMITTED / REGISTERED

---

## TASK 2.1 — Username = Registration Number (Clarity + Enforcement)

**Status:** `PARTIAL`  
**Priority:** Low

**Requirement:** The system must make it unmistakably clear to students that their login username is the same as their registration number. This will reduce the volume of students coming to the registry to ask for their usernames.

**What already exists:**
- `users.username` is a free-form field; when a student account is bulk-created, the username may not match the `regnumber`
- `UserController.bulkCreate()` creates accounts from student records

**What to build:**

1. **Backend — UserController.bulkCreate()**: Enforce that when creating a student portal account, `username` is set to the student's `regnumber`. Currently this may be set to the email or another value.

2. **Backend — StudentController / AdmissionController**: When a student is enrolled and a new account is created, always set `users.username = student.regnumber`.

3. **Frontend — LoginPage.tsx**: Update the placeholder and label text from "Username or Email" to "Username (your Registration Number) or Email" to make this explicit.

4. **Frontend — ApplicantOverviewPage.tsx**: When an offer is accepted and the student is transitioning to enrolled, show a message: "Your username for the student portal will be your registration number once assigned."

5. **Frontend — StudentDetailsPage.tsx** (admin): Show the student's portal username next to their registration number so registry can confirm they match.

**Files to change:**
- `backend/app/Controllers/UserController.php`
- `backend/app/Controllers/AdmissionController.php`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/pages/applicant/ApplicantOverviewPage.tsx`
- `frontend/src/pages/StudentDetailsPage.tsx`

---

## TASK 2.2 — Application Code as Temporary Login Identifier

**Status:** `MISSING`  
**Priority:** High

**Requirement:** Students who fulfil academic requirements but are missing some supporting documents (e.g., degree certificates, index numbers for health students) should receive their application code as a temporary login identifier. Once they provide the missing document, the system should replace the application code with the permanent registration number.

**What already exists:**
- `student_applications.application_number` — format `APP-YYYY-NNNNN`
- `users.username` — could hold application number temporarily
- No mechanism to replace application code with registration number on trigger

**What to build:**

1. **DB Migration**:
   ```sql
   ALTER TABLE student 
     ADD COLUMN temp_identifier VARCHAR(50) NULL COMMENT 'Application code used before reg number is assigned',
     ADD COLUMN reg_number_trigger_document VARCHAR(100) NULL COMMENT 'Which document triggers reg number assignment',
     ADD COLUMN reg_number_assigned_at TIMESTAMP NULL;
   ```

2. **Backend — AdmissionController**: Add a `provisional_enroll()` method for cases where documents are missing. Creates a student record with `regnumber = NULL` and `temp_identifier = application_number`. Creates a user account with `username = application_number`. This student can log in but is flagged as `pending_registration_number = 1`.

3. **Backend — StudentController / new endpoint**: `POST /api/students/:id/assign-regnumber` — called by registry when the triggering document (index number, degree certificate, equivalence) is uploaded. Generates the permanent registration number, updates `student.regnumber`, and updates `users.username` to the new registration number. Sends an email to the student informing them of their new username.

4. **Frontend — StudentDetailsPage.tsx**: For students with `temp_identifier` and no `regnumber`, show a highlighted "Pending Registration Number" badge and a "Assign Registration Number" button (triggers the endpoint above).

5. **Frontend — StudentDetailsPage.tsx**: Show a "Document trigger" field that lets registry specify what document will unlock the registration number (e.g., "Index Number" for health students, "Degree Certificate" for others).

**Files to change:**
- `backend/database/migrations/` — new migration
- `backend/app/Controllers/AdmissionController.php`
- `backend/app/Controllers/StudentController.php`
- `backend/routes/api/students.php`
- `frontend/src/pages/StudentDetailsPage.tsx`
- `frontend/src/services/studentService.ts`

---

## TASK 2.3 — Registration Forms per Entry Cohort

**Status:** `MISSING`  
**Priority:** Medium

**Requirement:** Each entry cohort should have a formal registration form (5 entries for direct-entry students, variable for credit transfer). Each entry is dated to the cohort date with individual exceptions allowed. The registry must be able to download the registration forms per entry and the progression roadmap per cohort.

**What already exists:**
- `intakes` table — `id, label, academic_year_id, is_active` defines cohort entries
- No registration form model or PDF generation for registration exists

**What to build:**

1. **DB Migration**:
   ```sql
   CREATE TABLE cohort_entries (
     id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     intake_id INT UNSIGNED NOT NULL REFERENCES intakes(id),
     entry_number INT NOT NULL COMMENT '1 to 5 for direct entry, 1+ for credit transfer',
     entry_date DATE NOT NULL,
     entry_type ENUM('direct','credit_transfer') DEFAULT 'direct',
     label VARCHAR(100),
     is_active TINYINT(1) DEFAULT 1,
     created_by INT UNSIGNED REFERENCES users(id),
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   
   CREATE TABLE student_cohort_entries (
     id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     student_id INT UNSIGNED NOT NULL REFERENCES student(id),
     cohort_entry_id INT UNSIGNED NOT NULL REFERENCES cohort_entries(id),
     individual_date_override DATE NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

2. **Backend — new CohortController**: CRUD for `cohort_entries`. Endpoints: `GET/POST /api/admin/cohorts`, `GET/PUT/DELETE /api/admin/cohorts/:id`, `GET /api/admin/cohorts/:id/students`. Also `GET /api/admin/cohorts/:id/registration-form` — generates and downloads a PDF registration form listing all students in the entry, ordered by application date.

3. **Backend — PDF helper** `CohortRegistrationFormPdf.php`: Builds a printable registration form per cohort entry. Format: CUR header, entry details (date, cohort, entry number), table of students (name, reg number, programme, campus, mode).

4. **Backend — new endpoint** `GET /api/admin/cohorts/:id/roadmap` — generates a PDF roadmap of the cohort's academic progression (based on their programme curriculum: which modules they take per semester/year).

5. **Frontend — IntakesManagementPage.tsx**: Expand to show and manage `cohort_entries` per intake (up to 5 for direct entry, dynamic for credit transfer). Show the entry date and allow per-entry date edits.

6. **Frontend — new CohortRegistrationPage.tsx**: Assign students to cohort entries, download registration forms, and download the progression roadmap.

**Files to change:**
- `backend/database/migrations/` — new migration
- `backend/app/Controllers/` — new CohortController.php
- `backend/app/Helpers/` — new CohortRegistrationFormPdf.php
- `backend/routes/api/` — new cohorts.php routes file
- `frontend/src/pages/admin/admissions/IntakesManagementPage.tsx`
- `frontend/src/pages/admin/admissions/` — new CohortRegistrationPage.tsx
- `frontend/src/services/admissionService.ts`

---

## TASK 2.4 — APRF: Application & Progression Report Form

**Status:** `MISSING`  
**Priority:** Very High

**Requirement:** A comprehensive "mother list" view of all student data from application through to graduation. The APRF must have expandable/collapsible columns, filterable headings, inline editing, a bulk-messaging capability, and must include the Application ID for quick tracking. Students are blocked from key system features until their profile is 100% complete.

**What already exists:**
- `StudentDetailsPage.tsx` shows individual student info ✓
- `StudentsPage.tsx` shows a student list with some filters ✓
- No APRF concept — no multi-column expandable report with inline editing exists

**What to build:**

1. **Backend — new endpoint** `GET /api/admin/students/aprf`: Returns a rich paginated dataset joining `student`, `student_applications`, `admission_offers`, `module_registrations`, `fee_invoices`, `clearance`, `attendance_records`, `grades`. Accepts filters: faculty, department, option, level, campus, sponsor, nationality, gender, disability, intake, academic_year, student_state, and a free-text search. Returns each student as a flat row with 30+ fields.

2. **Backend — PATCH /api/admin/students/aprf/:id**: Allows inline editing of selected non-fixed fields (address, phone, disability status, sponsor) directly from the APRF list view.

3. **Backend — POST /api/admin/students/aprf/message**: Accepts a `filter` object (same as list) and a `message` body. Sends a system message (via `MessageController`) to all students matching the filter.

4. **Frontend — new APRFPage.tsx**: 
   - A wide data table with column visibility toggles (checkboxes to show/hide column groups: Personal, Academic, Financial, Attendance, Status)
   - Each row is a student; clicking a row expands an inline detail panel for editing
   - Filter bar at the top with all filter dimensions
   - "Send Message to Filtered" button → compose modal → sends to all filtered students
   - "Export" button → downloads CSV/Excel of the current filtered view
   - Application ID visible in every row

5. **Backend — profile completeness check**: On student login (`AuthController.me()`), include a `profile_completeness_pct` field. In `StudentController.me()`, check required fields (DOB, nationality, phone, address, emergency contact, photo) and return a completeness score.

6. **Frontend — StudentDetailsPage.tsx** (self-view for student portal): If `profile_completeness_pct < 100`, show a persistent top banner: "Your profile is incomplete. Please fill in missing information to access all features." Link to the profile edit form.

**Files to change:**
- `backend/app/Controllers/StudentController.php` — new APRF endpoints
- `backend/routes/api/students.php` — new APRF routes
- `frontend/src/pages/admin/` — new APRFPage.tsx
- `frontend/src/pages/StudentDetailsPage.tsx` — profile completeness banner
- `frontend/src/services/studentService.ts`
- Router in `App.tsx` — new route `/admin/aprf`

---

## TASK 2.5 — Per-Academic-Year Statistics for Registered Students

**Status:** `PARTIAL`  
**Priority:** High

**Requirement:** A statistical table fixed per academic year showing student counts by: Faculty, Department, Option, Level, Nationality, Disability, Age group, Campus. Data is fixed at year-end and remains queryable for closed years. Same statistics available per month. All generated in-system (no Excel export required as the primary method).

**What already exists:**
- `AdminDashboardController.overview()` returns some aggregate counts
- `academic_years` table tracks open/closed years

**What to build:**

1. **DB Migration — snapshot table**:
   ```sql
   CREATE TABLE academic_year_statistics (
     id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     academic_year_id INT UNSIGNED NOT NULL REFERENCES academic_years(id),
     snapshot_date DATE NOT NULL,
     is_year_end_snapshot TINYINT(1) DEFAULT 0,
     data_json LONGTEXT NOT NULL COMMENT 'JSON blob: counts by faculty/dept/option/level/nationality/disability/age/campus',
     generated_by INT UNSIGNED REFERENCES users(id),
     generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

2. **Backend — new endpoint** `GET /api/admin/statistics/students`: Accepts `academic_year_id` and optional `month` (YYYY-MM). Returns live or snapshot breakdown by all dimensions. If a year-end snapshot exists, use it; otherwise compute live.

3. **Backend — new endpoint** `POST /api/admin/statistics/students/snapshot`: Freezes the current stats for a closed academic year. Requires `MANAGE_ACADEMIC_YEARS` permission.

4. **Frontend — new StudentStatisticsPage.tsx**: Year selector at the top. Below it, a matrix table with rows = Faculty/Department/Option and columns = Level, with sub-breakdowns by Nationality, Gender, Disability toggleable. A "Month" filter shows admitted-that-month counts. "Generate Snapshot" button for year-end freeze.

**Files to change:**
- `backend/database/migrations/` — new migration
- `backend/app/Controllers/` — new StatisticsController.php
- `backend/routes/api/` — new statistics.php routes
- `frontend/src/pages/admin/` — new StudentStatisticsPage.tsx
- `frontend/src/services/` — new statisticsService.ts
- Router in `App.tsx`

---

## TASK 2.6 — Export Templates: HEC, SAR, Mifotra

**Status:** `MISSING`  
**Priority:** High

**Requirement:** The system must generate the standard institutional reporting templates: HEC (only graduands for a given year), SAR, and Mifotra (with all fields matching the government template). All generated in-system.

**What already exists:**
- `AcademicsManagementController.bulkImport()` shows the XLSX import pattern (PhpSpreadsheet may need to be added)
- No export templates for HEC, SAR, or Mifotra exist

**What to build:**

1. **Backend — new ExportController.php**: Handles template exports.
   - `GET /api/admin/exports/hec?academic_year_id=X` — returns XLSX with HEC template columns, populated with all graduands for that year
   - `GET /api/admin/exports/mifotra` — returns XLSX matching Mifotra's required column format for all active students
   - `GET /api/admin/exports/sar` — returns XLSX for SAR template
   
2. **Backend — ExportService.php**: Builds each template using `PhpSpreadsheet`. Map student fields to the exact column headers required by each government/HEC template.

3. **Frontend — new ExportsPage.tsx**: Three download buttons, each with an academic year selector where applicable. Simple UI — select parameters, click download.

**Files to change:**
- `backend/app/Controllers/` — new ExportController.php
- `backend/app/Services/` — new ExportService.php
- `backend/routes/api/` — new exports.php routes
- `frontend/src/pages/admin/` — new ExportsPage.tsx
- `frontend/src/services/` — new exportService.ts
- `composer.json` — add `phpoffice/phpspreadsheet` if not present

---

## TASK 2.7 — Attendance Integration with APRF Active Status

**Status:** `PARTIAL`  
**Priority:** Medium

**Requirement:** Only students who are actively attending classes must be marked as "Active" in the APRF. Faculty attendance lists must be visible to the registry team. Lists should be arranged by application date so faculties can manage new student intake.

**What already exists:**
- `AttendanceController.php` — full attendance recording system ✓
- `attendance_sessions` and `attendance_records` tables ✓
- `student.student_state` field — tracks student status

**What to build:**

1. **Backend — StudentController (APRF endpoint)**: Include `attendance_rate` and `last_attended` in the APRF data. If a student has not attended any session in the current term, flag `is_effectively_active = 0` even if `student_state = 'active'`.

2. **Backend — AttendanceController**: Add `GET /api/attendance/registry-view` — accessible to users with `VIEW_ATTENDANCE` permission (not just lecturers). Returns all faculty attendance lists for the current term, ordered by student application date within each module.

3. **Frontend — APRFPage.tsx** (from Task 2.4): Add an "Active (Attendance)" column showing whether the student has attended in the last N days. Highlight rows where the student is registered but has 0 attendance.

4. **Frontend — new RegistryAttendanceView.tsx**: A read-only view for registry staff showing all faculty attendance sheets. Filterable by faculty, module, and date. Students listed by application date.

**Files to change:**
- `backend/app/Controllers/AttendanceController.php`
- `backend/app/Controllers/StudentController.php`
- `backend/routes/api/attendance.php`
- `frontend/src/pages/admin/` — new RegistryAttendanceView.tsx
- `frontend/src/services/attendanceService.ts`

---

## TASK 2.8 — Graduate Tracking, Cohort Tagging & Degree Classification

**Status:** `MISSING`  
**Priority:** High

**Requirement:** Each graduating student must be tagged with their graduation cohort number (1st, 2nd, 3rd, etc.). The degree classification (First Class, Second Class Upper, etc.) must be computed from module marks and recorded on the degree document. Detailed graduation statistics must be filterable by every dimension.

**What already exists:**
- `ModuleMarksController` and `DeliberationController` — marks and deliberation exist ✓
- No graduation model, cohort tagging, or degree classification computation

**What to build:**

1. **DB Migration**:
   ```sql
   CREATE TABLE graduation_cohorts (
     id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     academic_year_id INT UNSIGNED NOT NULL REFERENCES academic_years(id),
     cohort_number INT NOT NULL COMMENT '1 = first graduating class, 2 = second, etc.',
     graduation_date DATE NOT NULL,
     label VARCHAR(100),
     hec_approved TINYINT(1) DEFAULT 0,
     hec_approved_at TIMESTAMP NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   
   CREATE TABLE student_graduations (
     id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     student_id INT UNSIGNED NOT NULL REFERENCES student(id),
     graduation_cohort_id INT UNSIGNED NOT NULL REFERENCES graduation_cohorts(id),
     degree_classification ENUM('first','second_upper','second_lower','third','pass','fail') NULL,
     cumulative_gpa DECIMAL(4,2) NULL,
     graduated_at DATE NULL,
     clearance_form_id INT UNSIGNED NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

2. **Backend — new GraduationController.php**:
   - `GET /api/admin/graduation/cohorts` — list cohorts
   - `POST /api/admin/graduation/cohorts` — create new cohort
   - `GET /api/admin/graduation/cohorts/:id/students` — list students in cohort
   - `POST /api/admin/graduation/cohorts/:id/students` — add student(s) to cohort
   - `POST /api/admin/graduation/cohorts/:id/compute-classifications` — trigger degree classification computation from marks
   - `GET /api/admin/graduation/statistics` — filtered statistics endpoint

3. **Backend — degree classification algorithm**: Fetch all module marks for the student, compute cumulative GPA, apply the institutional classification thresholds (First: ≥70, Second Upper: 60–69, etc.), and store in `student_graduations.degree_classification`.

4. **Frontend — new GraduationPage.tsx**: Cohort list, student assignment, classification computation button, statistics breakdown by Faculty/Dept/Option/Gender/Disability/Nationality/Sponsorship/Campus/Level.

**Files to change:**
- `backend/database/migrations/` — new migration
- `backend/app/Controllers/` — new GraduationController.php
- `backend/routes/api/` — new graduation.php routes file
- `frontend/src/pages/admin/` — new GraduationPage.tsx
- `frontend/src/services/` — new graduationService.ts
- Router in `App.tsx`

---

## TASK 2.9 — Multi-Step Academic Clearance Form

**Status:** `PARTIAL`  
**Priority:** High

**Requirement:** Before any academic document is issued, a clearance form must be fully signed by: Dean(s), Director of Finance, Director of Library, Director of ICT, and finally the Registry. The registry issues the document only after all approvals are in.

**What already exists:**
- `ClearanceModel` and `ClearanceService` exist but are for **financial clearance** (exam eligibility), not the full multi-department academic clearance form
- `clearance` table only tracks financial clearance

**What to build:**

1. **DB Migration**:
   ```sql
   CREATE TABLE academic_clearance_forms (
     id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     student_id INT UNSIGNED NOT NULL REFERENCES student(id),
     requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     document_type VARCHAR(100) COMMENT 'degree, transcript, completion_letter, etc.',
     dean_approved_by INT UNSIGNED NULL REFERENCES users(id),
     dean_approved_at TIMESTAMP NULL,
     finance_approved_by INT UNSIGNED NULL REFERENCES users(id),
     finance_approved_at TIMESTAMP NULL,
     library_approved_by INT UNSIGNED NULL REFERENCES users(id),
     library_approved_at TIMESTAMP NULL,
     ict_approved_by INT UNSIGNED NULL REFERENCES users(id),
     ict_approved_at TIMESTAMP NULL,
     registry_approved_by INT UNSIGNED NULL REFERENCES users(id),
     registry_approved_at TIMESTAMP NULL,
     status ENUM('pending','partially_approved','fully_approved','rejected') DEFAULT 'pending',
     rejection_reason TEXT NULL
   );
   ```

2. **Backend — new ClearanceFormController.php**:
   - `POST /api/admin/clearance-forms` — request a clearance form for a student
   - `GET /api/admin/clearance-forms/:id` — get form status
   - `PATCH /api/admin/clearance-forms/:id/approve-dean` — Dean approval
   - `PATCH /api/admin/clearance-forms/:id/approve-finance`
   - `PATCH /api/admin/clearance-forms/:id/approve-library`
   - `PATCH /api/admin/clearance-forms/:id/approve-ict`
   - `PATCH /api/admin/clearance-forms/:id/approve-registry` — final approval; triggers document generation
   - Each PATCH endpoint checks that the user has the relevant role

3. **Backend — document generation controllers**: Before generating any academic document (degree, transcript, completion letter), check that an `academic_clearance_forms` record exists with `status = 'fully_approved'` for the student.

4. **Frontend — new ClearanceFormPage.tsx**: Shows all pending clearance forms assigned to the current user's approval stage. Each entry shows the student, requested document, and which stages are done/pending.

5. **Frontend — StudentDetailsPage.tsx**: "Request Clearance" button → selects document type → creates a new clearance form → shows approval pipeline progress.

**Files to change:**
- `backend/database/migrations/` — new migration
- `backend/app/Controllers/` — new ClearanceFormController.php
- `backend/routes/api/` — new clearance-forms.php routes
- `backend/app/Controllers/AdmissionController.php` — gate document generation
- `frontend/src/pages/admin/` — new ClearanceFormPage.tsx
- `frontend/src/pages/StudentDetailsPage.tsx`
- `frontend/src/services/` — new clearanceFormService.ts

---

---

# STAGE 3 — ACADEMIC DOCUMENTS

---

## TASK 3.1 — Admission Letter Enhancements (Editable Fields, Entry Level, E-Signature, Student Portal)

**Status:** `PARTIAL`  
**Priority:** High

**Requirement:** The admission letter must support editable non-fixed fields (entry level, faculty-specific additions). It must carry a secured electronic signature. It must appear in the student's own portal once approved.

**What already exists:**
- `AdmissionLetterPdf.php` — generates PDF admission letters ✓
- `AdmissionController.downloadLetter()` and `sendLetter()` ✓
- Student portal (`ApplicantOverviewPage.tsx`) does not yet show the letter

**What to build:**

1. **DB Migration**:
   ```sql
   ALTER TABLE admission_offers 
     ADD COLUMN entry_level VARCHAR(50) NULL COMMENT 'e.g. Level 8 S1-S2',
     ADD COLUMN faculty_specific_note TEXT NULL,
     ADD COLUMN letter_approved_at TIMESTAMP NULL,
     ADD COLUMN letter_approved_by INT UNSIGNED NULL REFERENCES users(id),
     ADD COLUMN letter_is_published TINYINT(1) DEFAULT 0 COMMENT 'Visible in student portal';
   ```

2. **Backend — AdmissionController**: Add `PATCH /api/admin/admission-offers/:id/letter-settings` to update `entry_level` and `faculty_specific_note`. Add `PATCH /api/admin/admission-offers/:id/publish-letter` to set `letter_is_published = 1` (making it visible in the student portal).

3. **Backend — AdmissionLetterPdf.php**: Add the entry level and faculty-specific note to the PDF template. Add an embedded electronic signature image (fetched from a configurable file in system settings). Add the issuing registry officer's name.

4. **Backend — ApplicantProfileController / StudentController.me()**: Include the admission offer's `letter_is_published` status and a `letter_download_url` token in the response so the student can download their letter from the portal.

5. **Frontend — OffersPage.tsx / ApplicationDetailPage.tsx** (admin): Add an "Edit Letter" panel showing the entry level selector (dropdown with all valid entry points per programme type) and the faculty-specific notes text area. Add "Publish to Student Portal" toggle.

6. **Frontend — ApplicantOverviewPage.tsx**: Show an "Admission Letter" card. If `letter_is_published = true`, show a "Download My Admission Letter" button. If not yet published, show "Letter not yet available."

**Files to change:**
- `backend/database/migrations/` — new migration
- `backend/app/Controllers/AdmissionController.php`
- `backend/app/Helpers/AdmissionLetterPdf.php`
- `backend/app/Controllers/ApplicantProfileController.php`
- `backend/routes/api/applications.php`
- `frontend/src/pages/admin/admissions/OffersPage.tsx`
- `frontend/src/pages/applicant/ApplicantOverviewPage.tsx`
- `frontend/src/services/admissionService.ts`

---

## TASK 3.2 — Academic Document Generation Suite

**Status:** `PARTIAL`  
**Priority:** Very High

**Requirement:** The system must generate the following documents, each with an embedded institutional stamp + e-signature + issuer identity:
1. **Degree** (post-HEC approval + clearance)
2. **Ongoing Student Letter** (for students pre-defence)
3. **Migration Service Letter** (for international students' visa)
4. **Completion Letter** (all requirements met)
5. **English Proficiency Certificate**
6. **Eligibility Letter** (to study elsewhere)
7. **No Objection Letter**
8. **Graduation Booklets**
9. **Rejection Letter** (with custom reason field)
10. **Deliberation Sheet** (printable, mandatory record)

**What already exists:**
- `AdmissionLetterPdf.php` — admission letter ✓
- `TranscriptPdf.php` — transcripts ✓
- `AttendanceReportPdf.php` — attendance report ✓
- `DocumentGenerationPage.tsx` — exists as a placeholder
- `DomPDF` library is installed ✓
- No other document types are implemented

**What to build:**

1. **Backend — new document helper classes** (one PHP class per document type, all in `backend/app/Helpers/`):
   - `DegreeDocumentPdf.php`
   - `OngoingStudentLetterPdf.php`
   - `MigrationServiceLetterPdf.php`
   - `CompletionLetterPdf.php`
   - `EnglishProficiencyPdf.php`
   - `EligibilityLetterPdf.php`
   - `NoObjectionLetterPdf.php`
   - `GraduationBookletPdf.php`
   - `RejectionLetterPdf.php`
   - `DeliberationSheetPdf.php`

   Each class generates a DomPDF-rendered document with: CUR letterhead, institutional stamp (image), electronic signature of the issuing officer, and a footer with the document reference number and date.

2. **Backend — new AcademicDocumentController.php**:
   - `GET /api/admin/documents/generate` — accepts `student_id`, `document_type`, and optional parameters (e.g., `rejection_reason` for rejection letters). Dispatches to the correct PDF helper.
   - For the **degree document**: verify `graduation_cohort` membership + HEC approval + clearance form `fully_approved`.
   - For **completion letter**: verify all marks recorded and final project submitted.
   - For **migration letter**: verify student is `is_international = 1`.
   - **Rejection letter**: accept a free-text `reason` parameter.
   - All document types: log the generation in `system_logs`.

3. **Frontend — DocumentGenerationPage.tsx**: Replace the placeholder with a real UI: student search, document type selector (dropdown of all 10 types), conditional fields (e.g., rejection reason text area appears only for rejection letters). A "Generate & Download" button and a "Generate & Email to Student" button.

4. **Frontend — StudentDetailsPage.tsx**: Add a "Generate Document" button on the student detail page that pre-fills the student and lets the admin pick the document type.

**Files to change:**
- `backend/app/Helpers/` — 10 new PDF helper classes
- `backend/app/Controllers/` — new AcademicDocumentController.php
- `backend/routes/api/` — new documents.php routes
- `frontend/src/pages/DocumentGenerationPage.tsx` — implement the UI
- `frontend/src/pages/StudentDetailsPage.tsx`
- `frontend/src/services/` — new documentService.ts

---

## TASK 3.3 — Transcripts: Per-Year, Cumulative, and Curriculum-Version-Aware

**Status:** `PARTIAL`  
**Priority:** High

**Requirement:** The system must generate (1) individual transcripts per academic year/level and (2) a cumulative transcript. Both must reflect the exact curriculum version the student was taught under (including outdated curricula). The deliberation decision must appear on the transcript; before deliberation is finalised, the transcript decision stays "Pending."

**What already exists:**
- `TranscriptPdf.php` — basic transcript PDF exists ✓
- `ModuleMarksController` — marks recorded per module ✓
- `DeliberationController` — deliberation grid exists ✓
- No curriculum versioning exists; the system has a flat module catalog

**What to build:**

1. **DB Migration — curriculum versions**:
   ```sql
   CREATE TABLE curriculum_versions (
     id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     program_id INT UNSIGNED NOT NULL,
     version_label VARCHAR(50) NOT NULL COMMENT 'e.g. 2019-2023, 2024+',
     effective_from DATE NOT NULL,
     effective_to DATE NULL COMMENT 'NULL = current version',
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   
   CREATE TABLE curriculum_version_modules (
     id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     curriculum_version_id INT UNSIGNED NOT NULL REFERENCES curriculum_versions(id),
     module_id INT UNSIGNED NOT NULL REFERENCES modules(id),
     level_id INT UNSIGNED NOT NULL,
     semester INT NOT NULL
   );
   ```

2. **Backend — TranscriptPdf.php**: Enhance to:
   - Accept a `type` parameter: `per_year` (requires `academic_year_id`) or `cumulative`
   - When generating, look up which `curriculum_version` was active during the student's enrolment year
   - Use `curriculum_version_modules` to list the correct modules for that student's version
   - For each module, show: code, title, credits, marks, grade, status (Pass/Fail/Pending)
   - If `deliberation_status` for the academic year is not yet `published`, show "PENDING" as the overall result instead of Pass/Fail

3. **Backend — ModuleMarksController / new endpoint**: `GET /api/admin/students/:id/transcript?type=per_year&year_id=X` and `GET /api/admin/students/:id/transcript?type=cumulative` — returns PDF download.

4. **Frontend — DocumentGenerationPage.tsx / StudentDetailsPage.tsx**: Add transcript type selector with year dropdown for per-year transcripts.

**Files to change:**
- `backend/database/migrations/` — curriculum versions migration
- `backend/app/Helpers/TranscriptPdf.php`
- `backend/app/Controllers/ModuleMarksController.php`
- `backend/routes/api/marks.php`
- `frontend/src/pages/DocumentGenerationPage.tsx`
- `frontend/src/pages/StudentDetailsPage.tsx`

---

---

# STAGE 4 — PROMOTION

---

## TASK 4.1 — Promotion Based on Financial Clearance + Deliberation Decision

**Status:** `PARTIAL`  
**Priority:** High

**Requirement:** Student promotion (advancement to the next level) must be based on BOTH the deliberation outcome AND financial clearance. A statistics table alongside deliberation must show counts of: Pass, Repeat, Suspension, Dropout.

**What already exists:**
- `DeliberationController.grid()` — deliberation data exists ✓
- `ClearanceService.checkClearance()` — financial clearance exists ✓
- No link between the two for promotion decisions

**What to build:**

1. **DB Migration**:
   ```sql
   CREATE TABLE promotion_decisions (
     id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     student_id INT UNSIGNED NOT NULL REFERENCES student(id),
     academic_year_id INT UNSIGNED NOT NULL REFERENCES academic_years(id),
     deliberation_decision ENUM('pass','repeat','suspension','dropout') NOT NULL,
     financial_cleared TINYINT(1) DEFAULT 0,
     final_decision ENUM('promoted','repeat','suspended','dropout','pending') DEFAULT 'pending',
     decided_by INT UNSIGNED REFERENCES users(id),
     decided_at TIMESTAMP NULL,
     next_level_id INT UNSIGNED NULL REFERENCES levels(id),
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

2. **Backend — new PromotionController.php**:
   - `GET /api/admin/promotion?academic_year_id=X` — returns all students with their deliberation decision and financial clearance status side by side. Includes summary counts: pass, repeat, suspension, dropout.
   - `PATCH /api/admin/promotion/:student_id/decide` — records the final promotion decision. If `deliberation_decision = 'pass'` AND `financial_cleared = 1`, sets `final_decision = 'promoted'` and updates `student.current_level`.
   - `POST /api/admin/promotion/bulk-promote` — applies promotion decisions in bulk for all students who pass both conditions.

3. **Frontend — new PromotionPage.tsx**: A table showing all students for the selected academic year with columns: Name, Reg#, Deliberation Result, Financial Clearance Status, Final Decision. Summary stats cards at the top (total passing, repeating, suspended, dropped). "Bulk Promote Eligible" button.

**Files to change:**
- `backend/database/migrations/` — new migration
- `backend/app/Controllers/` — new PromotionController.php
- `backend/routes/api/` — new promotion.php routes
- `frontend/src/pages/admin/` — new PromotionPage.tsx
- `frontend/src/services/` — new promotionService.ts
- Router in `App.tsx`

---

---

# STAGE 5 — STUDENT LISTS PER ACADEMIC YEAR

---

## TASK 5.1 — Downloadable, Print-Ready Student List per Academic Year

**Status:** `PARTIAL`  
**Priority:** Medium

**Requirement:** A downloadable student list for any selected academic year, formatted for printing and physical binding (A4, with proper headers, footers, page numbering, and row numbers).

**What already exists:**
- `StudentsPage.tsx` shows a student list with some filters ✓
- `StudentController.programModulesExport()` — XLSX export of program modules ✓
- No printable/bindable student list PDF exists

**What to build:**

1. **Backend — new endpoint**: `GET /api/admin/students/annual-list?academic_year_id=X&faculty_id=Y&campus_id=Z` — Accepts optional filters. Returns an ordered list (by registration number) of all students active in that academic year. Also supports a `format=pdf` parameter to return a DomPDF-generated printable PDF.

2. **Backend — new `AnnualStudentListPdf.php`** helper: Generates a multi-page PDF with: CUR header on each page, academic year label, page numbers ("Page X of Y"), row numbers, and columns: No., Reg. Number, Full Name, Programme, Campus, Attendance Mode, Gender, Year of Entry. Suitable for binding.

3. **Frontend — StudentsPage.tsx or new AnnualListPage.tsx**: An "Annual List" button that opens a modal asking for: Academic Year, Faculty (optional), Campus (optional). Two download buttons: "Download PDF (Print & Bind)" and "Download Excel". The PDF link calls the backend with `format=pdf`.

**Files to change:**
- `backend/app/Controllers/StudentController.php` — new annual list endpoint
- `backend/app/Helpers/` — new AnnualStudentListPdf.php
- `backend/routes/api/students.php`
- `frontend/src/pages/StudentsPage.tsx` or new page
- `frontend/src/services/studentService.ts`

---

---

# CROSS-CUTTING TASKS

---

## TASK X.1 — Permission Updates for All New Features

Every new controller and endpoint introduced in the tasks above requires corresponding permission entries in the RBAC system.

**What to build:**
- New migration seeding permissions for: `MANAGE_CAMPUS_ASSIGNMENTS`, `VIEW_INTERNATIONAL_STUDENTS`, `MANAGE_VISA_RECORDS`, `MANAGE_CLEARANCE_FORMS`, `APPROVE_CLEARANCE_DEAN`, `APPROVE_CLEARANCE_FINANCE`, `APPROVE_CLEARANCE_LIBRARY`, `APPROVE_CLEARANCE_ICT`, `MANAGE_GRADUATION`, `VIEW_APRF`, `MANAGE_PROMOTIONS`, `GENERATE_DOCUMENTS`, `MANAGE_COHORTS`, `VIEW_STATISTICS`
- Assign these permissions to the appropriate roles (Registrar, Admin, Finance Director, Library Director, ICT Director, Dean)

**Files to change:**
- `backend/database/migrations/` — new permissions seed migration
- `backend/app/Constants/` — update permission constants file

---

## TASK X.2 — System-Wide Audit Trail for Document Issuance

**Requirement:** Every issued academic document must record who issued it, allowing for accountability.

**What already exists:**
- `SystemLogService.log()` — audit logging exists ✓

**What to build:**
- In every document generation endpoint (Task 3.2), call `SystemLogService::log()` with: `action = 'DOCUMENT_GENERATED'`, `module = 'DOCUMENTS'`, `entity_type = 'student'`, `entity_id = student_id`, `description = "Generated [document_type] for [student_name]"`.
- In `GET /api/logs`, ensure document generation events are filterable by module = `DOCUMENTS`.

**Files to change:**
- All new document controllers — add `SystemLogService::log()` calls
- `frontend/src/pages/placeholders/LogsPage.tsx` — ensure `DOCUMENTS` module filter exists

---

## TASK X.3 — Navigation Updates

All new pages need to be added to:
1. The backend navigation endpoint (`NavigationController.menu()`) with appropriate permission gates
2. The frontend React Router in `App.tsx`
3. The sidebar/nav structure displayed to the user

**New nav sections to add:**
- Admissions → Statistics, Bulk Upload, Cohorts
- Students → APRF, International Students, Annual List, Promotion
- Graduation → Cohorts, Classifications
- Documents → Generate Documents, Clearance Forms
- Exports → HEC, Mifotra, SAR

---

## Implementation Priority Order

| Priority | Tasks |
|----------|-------|
| **Immediate (Sprint 1)** | 1.4 (reg number conflict), 1.6 (pending bug fix), 1.7 (visibility scoping), 2.1 (username clarity), 3.1 (admission letter portal) |
| **High (Sprint 2)** | 1.1 (campus assignment), 1.5 (program–campus), 1.10 (chat + progress), 1.11 (credit transfer), 2.4 (APRF), 2.9 (clearance form) |
| **High (Sprint 3)** | 1.12 (bulk upload), 1.13 (visa tracking), 2.8 (graduation), 3.2 (document suite), 4.1 (promotion) |
| **Medium (Sprint 4)** | 1.2 (pass limit), 1.3 (video links), 1.8 (filters), 1.9 (pending timeout), 1.14 (stats), 2.2 (temp identifier), 2.3 (cohort forms), 2.5 (year stats), 2.6 (templates), 3.3 (transcripts), 5.1 (annual list) |
| **Lower (Sprint 5)** | 2.7 (attendance/APRF), X.1 (permissions), X.2 (audit), X.3 (navigation) |

---

*Last updated: 2026-05-16*
