# CUR-MIS Gap Analysis Report
**Catholic University of Rwanda — Management Information System**
**Prepared by:** Senior Business Analyst (AI-Assisted)
**Date:** 2026-05-27
**Reference Document:** Request Proforma Invoice (Academic Modules)
**System Branch Reviewed:** `emmy`

---

## Executive Summary

This report compares the feature requirements listed in the CUR Request Proforma Invoice against the current state of the CUR-MIS system (PHP 8.4 MVC backend + React/TypeScript/Vite frontend). The system is well-advanced in admissions, finance, HR, attendance, and core academic management. However, **16 functional areas are missing or incomplete**, representing significant scope that must be delivered before the system can be considered fully compliant with the stated requirements.

---

## Methodology

The analysis was conducted by:
1. Extracting every stated requirement from the Proforma Invoice PDF
2. Auditing all 36 backend controllers, 22 route files, 92 frontend pages, 62 models, and 92 database migrations
3. Mapping each requirement to implemented code or noting its absence

**Status codes:**
- ✅ **Implemented** — Feature exists with full backend + frontend
- ⚠️ **Partial** — Backend or DB exists but frontend/workflow is incomplete
- ❌ **Missing** — No meaningful implementation found

---

## Module-by-Module Gap Analysis

---

### 1. Student Management Module

| Requirement | Status | Notes |
|---|---|---|
| Online Application & Public Portal | ✅ | `ApplyPage`, `ApplicationPortalController`, full workflow |
| Document Verification | ✅ | `DocumentVerificationController`, `VerificationsPage` |
| Merit List Generation (rankings, tie-breaking, PDFs) | ✅ | `MeritListController`, `MeritPage`, PDF via `AdmissionController` |
| Admission Confirmation / Offer Management | ✅ | `AdmissionController`, `OffersPage` |
| Student Registration (personal info, documents) | ✅ | `StudentController`, `ApplicantProfileController` |
| Student Profile Management (personal + contact) | ✅ | `StudentDetailsPage`, `UserProfilePage` |
| Academic Records (transcripts, mark sheets) | ⚠️ | Marks and transcript endpoints exist; no printable/downloadable transcript PDF page |
| Course Enrollment (per semester) | ✅ | `MyRegistrationsPage`, `ModulesManagementController` |
| Attendance Tracking (per class, reports) | ✅ | `AttendancePage`, `AttendanceController` |
| Fee Management (payments, receipts) | ✅ | Full finance module with `ReceiptPdfPage` |
| **Student ID Card** (name, photo, ID#, program, QR/barcode) | ❌ | `student_ids` table exists in DB but no ID card generation UI, no QR/barcode generation, no print template |

#### Gap 1 — Student ID Card Generation Module

A dedicated page and PDF/print template for generating student ID cards is absent. The `student_ids` table exists in the database but no controller, route, or frontend page consumes it.

**Required fields:** student name, photo, registration number, program/option, academic year, institution name, and a QR code or barcode linking to a verification endpoint.

---

### 2. Academic Transcripts Management System

| Requirement | Status | Notes |
|---|---|---|
| Course Management module | ✅ | `ModulesCatalogPage`, `ModulesManagementController` |
| Modules/courses per academic year | ✅ | Module offerings linked to academic years/terms |
| Assessment & reassessment grades per module | ✅ | CAT, partial, final marks with workflow states |
| Student Examination Results Capturing | ✅ | `ModuleMarksController`, `ExamResultsPage` |
| Deliberation Management | ⚠️ | `DeliberationPage` shows a read-only grid; no formal deliberation workflow (committee decisions, grade change approvals, outcome recording) |
| Credits per module/course per academic year | ✅ | Credit hours on modules, linked to registrations |
| Cumulative credits and GPA | ⚠️ | `studentTranscript` endpoint exists; no dedicated GPA summary page or cumulative credit report page |
| Electronic data capture of marks (secured channel) | ✅ | Role/permission-gated mark recording |
| **Transcript Management module** (downloadable PDF) | ❌ | Transcript data endpoint exists (`/marks/students/:regnumber/transcript`) but no PDF generation, no official transcript print layout, no request/dispatch workflow |
| **Graduand Management Module** | ❌ | `graduands` table exists in DB but no `GraduandController`, no frontend page, no eligibility checking, no graduation list management |
| Degree awarded and degree classification | ❌ | No degree classification engine (First Class, Second Class Upper, etc.) implemented |
| **Degree/Diploma/Certificate Management module** | ❌ | No certificate issuance, tracking, revocation, or digital signing capability |
| Reports Management module | ⚠️ | Some reports exist (revenue, clearance, billing); no consolidated academic reports module (cohort pass rates, academic progression, module failure rates) |

#### Gap 2 — Official Transcript PDF Generation

The API exposes mark data but there is no PDF transcript template, no student-initiated request flow, no admin dispatch workflow, and no official CUR letterhead-branded layout. This is a core deliverable for any university MIS.

#### Gap 3 — Graduand Management Module

The `graduands` table was created but the entire feature layer is absent: no controller, no API routes, no graduation eligibility check (credits completed + GPA threshold), no graduation list management, no ceremony tracking, and no frontend page.

#### Gap 4 — Degree Classification Engine

No logic exists to classify a student's final award (e.g., First Class Honours, Upper Second, Pass) based on their cumulative GPA against configurable thresholds. This is required to populate transcripts and certificates correctly.

#### Gap 5 — Degree/Diploma/Certificate Management

No module exists to: issue certificates, record dispatch, flag replacements/duplicates, or link award records to student profiles. This is distinct from transcript management.

#### Gap 6 — Formal Deliberation Workflow

The current `DeliberationPage` is a read-only grid. Missing: committee-level grade override approvals, formal minutes recording, board decision persistence, and final grade lock-and-publish workflow.

---

### 3. Course Management Module

| Requirement | Status | Notes |
|---|---|---|
| Course Catalog (descriptions, prerequisites, credit hours) | ✅ | `ModulesCatalogPage`, `ModulePrerequisiteModel` |
| Course Scheduling (class schedules) | ✅ | `ModulesSchedulePage`, `ModuleScheduleModel` |
| Course Registration (by program and academic year) | ✅ | `MyRegistrationsPage`, self-register flow |
| Course Assignment (faculty to courses) | ✅ | `ModulesAssignmentsPage`, `ModuleAssignmentModel` |

> No gaps identified in this module.

---

### 4. Faculty Management Module

| Requirement | Status | Notes |
|---|---|---|
| Faculty Profile Management (personal, qualifications, subjects) | ⚠️ | `StaffListPage`/`StaffDetailPage` covers personal info; qualifications/credentials tracking is absent |
| Course Assignment | ✅ | `ModuleAssignmentModel`, `ModulesAssignmentsPage` |

#### Gap 7 — Faculty Qualifications & Credentials Tracking

Staff profiles capture basic personal details but there is no structured data capture for: academic qualifications (degrees held, institution, year), professional certifications, or teaching specialisations. This is required for Faculty Profile Management as specified.

---

### 5. Fee Management Module

| Requirement | Status | Notes |
|---|---|---|
| Real-time payment capture | ✅ | UrubutoPay integration + manual recording |
| Bank receipt with student names, reg#, faculty/dept/class, reason, date/time | ✅ | `ReceiptPdfPage`, `ReceiptDocument` component |
| Auto-identify required fee per student category (incl. repeat subjects, arrears) | ✅ | `FeeService::autoGenerateInvoices`, `ClearanceService` |
| Digitization / electronic transfer mechanisms | ✅ | Online payment via UrubutoPay |
| Payment tracking with alerts for late/non-payment | ⚠️ | Invoices are tracked; no automated alert/notification system for overdue fees (email/SMS triggers) |
| Admission & registration fees | ✅ | Fee types configurable |
| Tuition fees | ✅ | Fee structures per program |
| Academic document fines | ❌ | No fines management module — no fine types, fine issuance, fine tracking, or fine payment workflow |
| Hostel fees | ⚠️ | Can be configured as a fee type; no Hostel Management module (room assignment, occupancy, hostel billing automation) |
| Distribution of bursary | ✅ | `BursariesPage`, `FeeBursaryModel` |

#### Gap 8 — Automated Overdue Payment Alerts

No scheduled job or event-driven notification sends alerts to students or finance staff when fee deadlines are missed. The data model supports this but the notification trigger layer is absent.

#### Gap 9 — Fines Management

No module exists for issuing, tracking, or collecting fines for academic documents (e.g., late transcript requests, lost ID card replacements, library fines). Required as a stated revenue category.

---

### 6. Examination and Assessment Module

| Requirement | Status | Notes |
|---|---|---|
| Exam Scheduling | ✅ | `ExamSchedulesPage`, `ExamScheduleModel` |
| Exam Enrollment (students register for exams) | ✅ | Module registrations gate exam visibility; `myExams` endpoint |
| Result Processing (grades, mark sheets) | ✅ | `ModuleMarksController`, `ExamResultsPage` |
| Grade Management (grading criteria, grade points, GPA) | ⚠️ | `grading_scales` table exists; no UI to configure grading scale, no GPA computation page visible to students or admin |
| **Revaluation and Backlog Management** | ❌ | `revaluations` table exists in DB but no `RevaluationController`, no backlog tracking, no student revaluation request workflow |

#### Gap 10 — Revaluation & Backlog Management

Students have no way to submit revaluation (remarking) requests. Administrators have no tool to track backlog modules (modules a student must retake). The `revaluations` table was created but remains entirely unused.

#### Gap 11 — Grading Scale Configuration UI

The `grading_scales` table exists in the database but there is no admin page to define or adjust the grading scale (e.g., A = 80–100 = 4.0 GPA points). Without this, GPA computation relies on hardcoded values, reducing flexibility.

---

### 7. Timetable Management Module

| Requirement | Status | Notes |
|---|---|---|
| Class Scheduling (creation and distribution of timetables) | ✅ | `ModulesSchedulePage`, timetable import/export |
| Room Allocation | ✅ | `RoomModel`, rooms linked to module schedules |

> No gaps identified in this module.

---

### 8. Communication Module

| Requirement | Status | Notes |
|---|---|---|
| Announcements (exam schedules, results, holidays) | ⚠️ | Internal messaging exists; no broadcast announcement system — no role-wide or cohort-wide push notification mechanism |
| Messages/Emails (internal messaging system) | ✅ | `MessagesPage`, `MessageController`, full conversation/thread model |
| **Discussion Forums** | ❌ | Not implemented — no forum categories, threads, posts, replies, or moderation tools |

#### Gap 12 — Discussion Forums

No forum or community discussion platform exists. Students and faculty currently have no structured space to discuss academic topics, ask questions, or share resources.

#### Gap 13 — Broadcast Announcement System

The messaging module supports 1-to-1 and group conversations but lacks a broadcast announcement channel where administrators can push notifications to all students, a specific cohort, a faculty, or a program group (e.g., "Exam timetable published for Semester 1").

---

### 9. Administration and Management Module

| Requirement | Status | Notes |
|---|---|---|
| User Roles and Permissions | ✅ | Full RBAC with `RolesManagementPage`, `PermissionsManagementPage` |
| Dashboard | ✅ | `AdminDashboardPage` with metrics |
| Reports and Analytics | ⚠️ | Finance and attendance reports exist; no unified academic analytics dashboard (pass/fail rates, enrollment trends, module performance) |

#### Gap 14 — Academic Analytics & Reporting Dashboard

The admin dashboard covers headcount and financial KPIs. Missing: module pass/fail rates by cohort, academic progression tracking, enrollment trend analytics, attendance compliance reports by program, and department-level performance comparisons.

---

### 10. Gate Management

| Requirement | Status | Notes |
|---|---|---|
| Verifier for payment (payment clearance at gate) | ❌ | `gate_logs` table exists; no `GateManagementController`, no gate verification UI, no QR scan or student lookup at entry point |
| Verifier for registration (registration status at gate) | ❌ | No registration status check UI for gate staff |

#### Gap 15 — Gate Management Module

The `gate_logs` table was created anticipating this feature, but the entire functional layer is absent. Gate officers have no tool to verify whether a student has paid fees and/or is registered before granting access to campus or exam venues.

**Required:** A fast-lookup interface (scan student ID barcode/QR or search by registration number) returning a clear pass/deny status per verification type.

---

### 11. HR Module

| Requirement | Status | Notes |
|---|---|---|
| Staff Management | ✅ | `StaffListPage`, `HrEmployeeController` |
| Leave Management | ✅ | `LeavePage`, `LeaveController` |
| Payroll Management | ✅ | `PayrollPage`, `HrPayrollController`, deductions, salary payments |
| **Appraisal** | ❌ | Not implemented — no appraisal cycles, criteria, ratings, self-assessments, or supervisor reviews |

#### Gap 16 — Employee Appraisal Module

No performance appraisal system exists.

**Required capabilities:** appraisal period management, KPI/criteria configuration, self-assessment by staff, supervisor rating and comments, HR review, and appraisal history per employee.

---

## Consolidated Gap Summary

| # | Gap | Module | Priority | DB Scaffold? |
|---|---|---|---|---|
| 1 | Student ID Card Generation (QR/barcode, print template) | Student Management | High | Partial (`student_ids` table) |
| 2 | Official Transcript PDF Generation & Dispatch Workflow | Academic Transcripts | **Critical** | Partial (data endpoints only) |
| 3 | Graduand Management Module (eligibility, lists, ceremony) | Academic Transcripts | High | Partial (`graduands` table) |
| 4 | Degree Classification Engine (First Class, Upper Second, etc.) | Academic Transcripts | High | None |
| 5 | Degree/Diploma/Certificate Issuance & Tracking | Academic Transcripts | High | None |
| 6 | Formal Deliberation Workflow (committee decisions, grade lock) | Academic Transcripts | Medium | Partial (read-only grid) |
| 7 | Faculty Qualifications & Credentials Tracking | Faculty Management | Medium | None |
| 8 | Automated Overdue Fee Alert Notifications | Fee Management | Medium | None |
| 9 | Fines Management Module | Fee Management | Medium | None |
| 10 | Revaluation & Backlog Management | Examination & Assessment | High | Partial (`revaluations` table) |
| 11 | Grading Scale Configuration UI | Examination & Assessment | Medium | Partial (`grading_scales` table) |
| 12 | Discussion Forums | Communication | Low | None |
| 13 | Broadcast Announcement System | Communication | Medium | None |
| 14 | Academic Analytics & Reporting Dashboard | Administration | Medium | None |
| 15 | Gate Management Module (payment + registration verifier) | Gate Management | High | Partial (`gate_logs` table) |
| 16 | Employee Appraisal Module | HR | Medium | None |

**Total: 16 identified gaps** across 8 of the 10 stated requirement modules.

---

## Features Implemented But Requiring UAT Verification

The following are technically implemented but may need user acceptance testing before sign-off:

1. **Payment Plan / Installment Management** — `fee_payment_plans` and `fee_installments` tables exist but no frontend UI was confirmed
2. **Finance Budget Management** — `finance_budgets` table exists; frontend coverage of budget vs. actual needs validation
3. **Hostel Fee Automation** — Hostel fees can be set as a fee type but no room-assignment-driven auto-billing exists
4. **Credit Transfer / Exemption** — Backend fields and `credit_transfer` status exist on applications; full UI workflow needs validation
5. **GPA Display for Students** — `studentTranscript` endpoint exists; student-facing GPA display on the portal needs confirmation

---

## Recommended Delivery Phases

### Phase 1 — Critical Academic Deliverables *(Immediate)*
- Gap 2: Transcript PDF generation
- Gap 3: Graduand Management
- Gap 10: Revaluation & Backlog Management
- Gap 15: Gate Management

### Phase 2 — Core Completeness
- Gap 1: Student ID Card
- Gap 4: Degree Classification Engine
- Gap 5: Certificate Management
- Gap 11: Grading Scale UI
- Gap 13: Broadcast Announcements

### Phase 3 — Enhancement & Compliance
- Gap 6: Formal Deliberation Workflow
- Gap 7: Faculty Qualifications
- Gap 8: Overdue Fee Alerts
- Gap 9: Fines Management
- Gap 14: Academic Analytics Dashboard
- Gap 16: Employee Appraisal

### Phase 4 — Nice-to-Have
- Gap 12: Discussion Forums

---

*End of Gap Analysis Report — Catholic University of Rwanda MIS | 2026-05-27*
