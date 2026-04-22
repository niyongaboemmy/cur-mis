# CUR-MIS · Student Management / Admissions Module

End-to-end guide for the admissions workflow: from a prospective student
discovering CUR to the moment their application turns into an enrolled
student record.

This module has **three audiences**:

1. **Prospective students** — use the public portal (no login)
2. **Applicants (authenticated)** — after claiming their account
3. **Staff admins** — configure, review, decide, enroll

---

## 1. Roles & permissions

| Role         | Key permissions (granted by migration 010) |
|--------------|--------------------------------------------|
| `admin` / superadmin | All four new slugs auto-granted |
| `applicant`  | `MANAGE_OWN_PROFILE` |
| Custom staff roles can be granted a subset below. |

| Permission slug                   | What it unlocks                                                                                 |
|-----------------------------------|--------------------------------------------------------------------------------------------------|
| `MANAGE_ADMISSION_REQUIREMENTS`   | Document types catalogue + per-faculty/year requirements                                         |
| `MANAGE_STUDENT_APPLICATIONS`     | Applications list, detail view, status transitions, internal notes                               |
| `VERIFY_DOCUMENTS`                | Approve / reject uploaded documents                                                              |
| `MANAGE_ADMISSIONS`               | Merit criteria, merit-list generation & publish, offers, enrollment initiation                   |
| `MANAGE_OWN_PROFILE`              | An applicant can manage their profile, academic records, and documents                           |

---

## 2. DB changes (what the migrations did)

Three migrations in `backend/database/migrations/` created the module:

- **009 — `create_admission_tables`**
  - Renames legacy `application`, `application_documents`, `application_options` → `legacy_*`
  - Creates: `document_types`, `admission_requirements`, `student_applications`, `application_documents`, `application_status_log`, `merit_criteria`, `merit_lists`, `admission_offers`
- **010 — `seed_admission_data`**
  - Seeds 7 default document types (National ID, Diploma, Transcript, Passport photo, Birth cert, Medical cert, Recommendation)
  - Adds the **Admissions** permission category
  - Creates permissions `MANAGE_ADMISSION_REQUIREMENTS`, `MANAGE_STUDENT_APPLICATIONS`, `VERIFY_DOCUMENTS`, `MANAGE_ADMISSIONS`
  - Assigns all four to the superadmin role (id 1)
- **011 — `create_applicant_profile_tables`**
  - Adds `users.is_applicant` flag
  - Creates `applicant_profiles`, `applicant_academic_records`
  - Seeds the `applicant` role + `MANAGE_OWN_PROFILE` permission, links them

> Note: these migrations were authored with MariaDB `ALTER TABLE IF EXISTS` / `ADD COLUMN IF NOT EXISTS` syntax. On MySQL 8 (e.g. MAMP), check column/table existence before the `ALTER` lines, or run the CREATE/INSERT portions only — see the applied state in your local DB if unsure.

---

## 3. End-to-end workflow

```
┌──────────────────────┐    ┌───────────────────────┐   ┌───────────────────────┐
│ Prospective student  │    │ Applicant (authed)    │   │ Admin staff           │
│ /apply               │    │ /applicant            │   │ /admin/admissions     │
└──────────┬───────────┘    └───────────┬───────────┘   └───────────┬───────────┘
           │  ①                         │                           │
           ▼                            │                           │
  Submit application ─────────► status = submitted                  │
           │                            │                           │
           │                            ▼                           │
           │                    Upload documents                    │
           │                            │                           │
           │                            ▼                           │
           │                    status = documents_under_review ◄───┤ ②
           │                                                        │
           │                                               ◄───────► ③ Verify each doc
           │                                                        │   (approve/reject)
           │                                                        │
           │                                                        ▼
           │                                                 ④ Criteria + generate merit list
           │                                                        │
           │                                                        ▼
           │                                                 ⑤ Publish + make offers
           ▼                                                        │
   Track by application number  ◄───────────────────────────────────┤
   Accept / decline offer                                           │
           │                                                        │
           ▼                                                        ▼
                                                          ⑥ Initiate enrollment →
                                                             creates student record
```

### Step ①  Prospective student submits an application

**URL:** `http://localhost:5173/apply`

Five-step wizard:

1. **Program** — pick faculty → pick program → pick intake.
   Live-loads the document checklist for that faculty.
2. **Personal** — name, email, phone, gender, birthdate, nationality, address.
3. **Academic** — previous school, qualification, grade, combination, graduation year.
4. **Sponsorship** — self / government / private / scholarship (+ sponsor name).
5. **Review & submit** — JSON sent to `POST /api/portal/applications`.

Response returns `{ id, application_number }`. The number looks like `APP-2026-00042`
and is the applicant's handle from then on.

### Step ②  Applicant uploads documents

Two paths:

- **Public tracking page** (`/apply/track?no=APP-...`) — check status
- **Applicant portal** (`/applicant`, authenticated) — upload each required doc

Upload flow:

1. Applicant posts file to the file-server service (separate microservice — returns a file UUID).
2. Frontend calls `POST /api/applicant/documents` with `{ document_type_id, file_server_id, file_original_name, file_size, file_mime }`.
3. Each doc starts in `verification_status = pending`.

Once **any** document is uploaded the server advances the application's `status` to
`documents_under_review`.

### Step ③  Admin verifies each document

**URL:** `/admin/admissions/verifications` (queue) or dive directly via the application detail.

For each uploaded document the reviewer:

- Clicks **Open** to view the file (downloads via `/api/admin/verifications/:app/:doc/download`)
- Clicks **Approve** (`PATCH` with `verification_status: 'verified'`) or **Reject** (prompts for `rejection_notes`)

When **all required** docs are verified the server flips
`application.document_status = verified` and `application.status = documents_verified`.

### Step ④  Merit list

**URL:** `/admin/admissions/merit`

Select **Program + Intake + Active academic year**, then:

1. **Set criteria** — weights for grade / combination / other, optional minimum grade, cutoff score, max capacity. Saves to `merit_criteria`.
2. **Generate list** — server computes `merit_score = grade_weight×grade_pct + combination_weight×combination_pct + other_weight×other_pct` for every `documents_verified` application, ranks them, persists to `merit_lists`, sets `status = merit_listed` for those within capacity.
3. **Publish** — sets `merit_criteria.is_published = 1` so the results are visible to applicants.

### Step ⑤  Admission offers

**URL:** `/admin/admissions/offers`

- **Individual:** Click "New offer", provide application ID + expiry date → creates `admission_offers` row with a unique `offer_letter_reference`. Server sets `application.status = offered`.
- **Bulk:** `POST /api/admin/admissions/offers/bulk` with an array of IDs — batch-creates offers for all qualified merit-listed applicants.

Applicant can then **accept** or **decline** from `/apply/track` (public) or `/applicant`
(authenticated):

- `accept` → `status = offer_accepted`
- `decline` → `status = offer_declined` (slot freed)

### Step ⑥  Enrollment

On the Offers page, for each **accepted** offer click **Enroll**:

- `POST /api/admin/admissions/offers/:id/enroll`
- Server creates a row in the `student` table, links `admission_offers.student_id`, sets `admission_offers.enrollment_initiated = 1`, flips `application.status = enrolled`.

From here the student is in the `Student Registry` (`/students`) and handled by the Academic module.

---

## 4. Frontend pages (where to click)

| Route                                  | Who     | Purpose                                                                       |
|----------------------------------------|---------|-------------------------------------------------------------------------------|
| `/apply`                               | Public  | Multi-step application wizard                                                 |
| `/apply/track?no=APP-...`              | Public  | Track status, view documents, accept/decline offer                            |
| `/admin/admissions`                    | Staff   | Hub tabs: Applications / Verifications / Merit / Offers / Requirements / Types |
| `/admin/admissions/applications`       | Staff   | Filterable list (status, free-text), drill-in view                            |
| `/admin/admissions/applications/:id`   | Staff   | Full detail — status dropdown, docs, notes, history                           |
| `/admin/admissions/verifications`      | Staff   | Only apps with pending doc review                                             |
| `/admin/admissions/merit`              | Staff   | Criteria + Generate + Publish + ranked list                                   |
| `/admin/admissions/offers`             | Staff   | Create / list offers, enroll accepted applicants                              |
| `/admin/admissions/requirements`       | Staff   | Per-faculty/year document checklist, plus copy-to-year                        |
| `/admin/admissions/document-types`     | Staff   | Global catalogue CRUD                                                         |
| `/applicant`                           | Applicant | 4-tab hub: Overview / Profile / Records / Documents                         |

Sidebar already lists **Admissions** as a top-level group with all 6 admin tabs.

---

## 5. API cheat-sheet

### Public portal (no auth)
```
GET  /api/portal/active-year
GET  /api/portal/faculties
GET  /api/portal/faculties/:id/programs
GET  /api/portal/faculties/:id/requirements
POST /api/portal/applications
GET  /api/portal/applications/:number
POST /api/portal/applications/:number/documents
POST /api/portal/applications/:number/respond        { response: 'accept'|'decline' }
```

### Applicant (auth + `is_applicant`)
```
GET  /api/applicant/profile                 PUT /api/applicant/profile
POST /api/applicant/profile/photo
GET  /api/applicant/application
GET  /api/applicant/academic-records        POST /api/applicant/academic-records
PUT  /api/applicant/academic-records/:id    DELETE /api/applicant/academic-records/:id
POST /api/applicant/academic-records/:id/set-primary
GET  /api/applicant/documents               POST /api/applicant/documents
DELETE /api/applicant/documents/:id
```

### Admin
```
# Doc types — MANAGE_ADMISSION_REQUIREMENTS
GET/POST /api/admin/document-types
GET/PUT/DELETE /api/admin/document-types/:id

# Requirements — MANAGE_ADMISSION_REQUIREMENTS
GET/POST /api/admin/admission-requirements
POST /api/admin/admission-requirements/copy
GET  /api/admin/admission-requirements/faculty/:f/year/:y
PUT/DELETE /api/admin/admission-requirements/:id

# Applications — MANAGE_STUDENT_APPLICATIONS
GET  /api/admin/applications                GET /api/admin/applications/:id
PATCH /api/admin/applications/:id/status    { status, notes? }
POST  /api/admin/applications/:id/notes

# Verifications — VERIFY_DOCUMENTS
GET  /api/admin/verifications
GET  /api/admin/verifications/:app/documents
PATCH /api/admin/verifications/:app/documents/:doc    { verification_status, rejection_notes? }
GET  /api/admin/verifications/:app/documents/:doc/download

# Merit — MANAGE_ADMISSIONS
GET  /api/admin/merit/criteria?program_id=&intake=&academic_year_id=
POST /api/admin/merit/criteria
POST /api/admin/merit/generate
GET  /api/admin/merit/list
PATCH /api/admin/merit/publish

# Offers — MANAGE_ADMISSIONS
GET  /api/admin/admissions/offers            POST /api/admin/admissions/offers
POST /api/admin/admissions/offers/bulk
GET  /api/admin/admissions/offers/:id
POST /api/admin/admissions/offers/:id/enroll
```

---

## 6. Frontend files

```
frontend/src/
├─ types/admission.ts                            # all types for this module
├─ services/admissionService.ts                  # portalService, documentTypeService,
│                                                # admissionRequirementService,
│                                                # applicationAdminService,
│                                                # verificationService, meritService,
│                                                # offerService, applicantService
├─ pages/public/
│  ├─ ApplyPage.tsx                              # 5-step application wizard (no auth)
│  └─ TrackApplicationPage.tsx                   # track by app number (no auth)
├─ pages/admin/admissions/
│  ├─ AdmissionsHub.tsx                          # shell with 6 tabs
│  ├─ ApplicationsListPage.tsx                   # filter + paginate
│  ├─ ApplicationDetailPage.tsx                  # deep-dive + verify docs + notes
│  ├─ VerificationsPage.tsx                      # queue of apps pending review
│  ├─ MeritPage.tsx                              # criteria + generate + publish
│  ├─ OffersPage.tsx                             # list + create + enroll
│  ├─ RequirementsPage.tsx                       # per-faculty/year checklist
│  └─ DocumentTypesPage.tsx                      # global catalogue CRUD
└─ pages/applicant/
   └─ ApplicantPortalPage.tsx                    # 4-tab hub: overview/profile/records/docs
```

Routes live in [src/App.tsx](frontend/src/App.tsx); sidebar entries live in
[src/layouts/MainLayout.tsx](frontend/src/layouts/MainLayout.tsx) under the
"Admissions" group.

---

## 7. Local dev quickstart

1. Run the MAMP backend (port 8888).
2. Make sure the three admission migrations have been applied — see the **DB changes** section.
3. `cd frontend && npm run dev` — Vite serves on 5173.
4. As a prospective student: open `http://localhost:5173/apply`
5. As an admin: log in at `/login`, then go to Admissions via the sidebar.
6. As an applicant (once account-claim is implemented): log in → land on `/applicant`.

File uploads expect a separate **file-server** microservice that returns a UUID; the
frontend passes that UUID (`file_server_id`) to the document endpoints. The
document-upload UI in the applicant portal currently accepts a pasted UUID for
manual testing — swap in a real uploader component when your file-server is ready.
