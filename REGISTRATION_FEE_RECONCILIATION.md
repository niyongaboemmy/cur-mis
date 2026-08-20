# Registration Fee Reconciliation: Analysis & Solution Proposal

**Prepared by:** Senior Systems Analyst  
**Date:** 2026-06-29  
**Status:** Draft for Review  
**Scope:** Student Application Payment ↔ Finance Fee Structure Integration

---

## Executive Summary

The system currently operates two financially independent payment flows that never speak to each other:

1. **Application Fee** — A one-time fee (RWF 5,000) paid by applicants during the online application process, stored in the `student_applications` table.
2. **Finance Billing** — Invoices generated for enrolled students from the `fee_structures` module, stored in `fee_invoices` and `fee_payments` tables.

**The critical gap:** When an applicant is enrolled and becomes a student, the application fee they already paid is never credited to their student account. Worse, if a `REGISTRATION` fee type exists in the fee structure, it is invoiced separately on top of the already-paid application fee — creating double-charging risk and a reconciliation nightmare for the finance office.

This document maps both systems, identifies all gaps, and proposes a concrete implementation plan to bridge them.

---

## 1. Current System Architecture

### 1.1 System 1 — Application Payment

**Entry point:** Public apply portal (`/apply`)  
**5-step wizard in `ApplyPage.tsx`:** Personal Info → Academic Info → Programs → Documents → **Payment**

**What happens at payment step:**

```
Applicant clicks "Pay Application Fee"
         ↓
GET /api/applicant/application/payment/checkout
         ↓
ApplicantProfileController::getPaymentCheckout()
         ↓
UrubutoPayService::generateApplicationCheckoutUrl()
         ↓
UrubutoPay hosted checkout opens (deep link / USSD *775#)
         ↓
Applicant pays RWF 5,000
         ↓
UrubutoPay calls POST /api/payment/webhook/callback
         ↓
UrubutoPayService::recordApplicationPayment()
         ↓
UPDATE student_applications SET
  transaction_id = 'TXN-ABC123',
  payment_amount = 5000,
  payment_currency = 'RWF',
  paid_at = NOW()
WHERE application_number = 'APP-2026-00001'
```

**Where the money lives:**

| Table | Column | Value Example |
|-------|--------|---------------|
| `student_applications` | `transaction_id` | `UP-CSJQP1JM` |
| `student_applications` | `payment_amount` | `5000.00` |
| `student_applications` | `payment_currency` | `RWF` |
| `student_applications` | `paid_at` | `2026-06-15 14:10:00` |

**No row is created in `fee_invoices` or `fee_payments` at this stage.**

---

### 1.2 System 2 — Finance Fee Structure

**Configured by:** Finance admin via "Fee Rates" tab  
**Tables involved:** `fee_structures` → `fee_invoices` → `fee_payments`

**Fee types defined in the system:**

| Fee Type | Description | When Applied |
|----------|-------------|--------------|
| `TUITION` | Annual tuition | All enrolled students |
| `REGISTRATION` | One-time registration fee | First-year students only |
| `ADMISSION` | Conceptual (not yet linked to application) | Currently unused in automation |
| `HOSTEL` | Accommodation | Students with hostel |
| `ACADEMIC_DOCUMENT` | Transcripts, certificates | On request |
| `FINE` | Late payment penalties | Triggered manually |
| `REPEAT_MODULE` | Re-sit exam fees | Students with failures |

**Invoice auto-generation** (`FeeService::autoGenerateInvoices()`):

```
Admin triggers: POST /api/finance/invoices/auto-generate
         ↓
For each enrolled student:
         ↓
FeeStructureModel::findBestMatch(
    academicYearId, feeType, departmentId, levelId
)
         ↓
Creates fee_invoice rows:
  - TUITION:       amount_due = 500,000 RWF  ← from fee_structures
  - REGISTRATION:  amount_due = 100,000 RWF  ← from fee_structures (first year)
  - HOSTEL:        amount_due =  50,000 RWF  ← from fee_structures

Total: 650,000 RWF outstanding — status = "unpaid"

⚠️  The 5,000 RWF application payment is NOT referenced here.
```

---

### 1.3 The Enrollment Bridge (Where the Gap Lives)

**File:** `backend/app/Services/ApplicationService.php`  
**Method:** `initiateEnrollment($offerId, $actorId, $levelId)`

Current enrollment flow:

```php
// What exists today:
$studentId = $this->studentModel->create($studentData);      // ✅ Creates student row
$this->db->execute("UPDATE admission_offers SET ...");        // ✅ Marks offer enrolled
$this->db->execute("UPDATE student_applications SET ...");    // ✅ Marks application enrolled

// What is MISSING:
// ❌ No lookup of student_applications.payment_amount
// ❌ No creation of fee_payments record for application fee
// ❌ No credit applied against first invoice batch
// ❌ No FK stored linking student_applications → students
```

**No automatic invoice generation is triggered at enrollment.** Finance must run it manually.  
**No application payment transfer occurs** — ever, in the current codebase.

---

## 2. Full Gap Analysis

### Gap 1: No Data Link Between Application and Student Records

When enrollment happens, the application row and the new student row have no explicit foreign key joining them. The only shared data is:
- `admission_offers.enrollment_initiated = 1` and `admission_offers.student_id = <new_student_id>`
- The application's `applicant_user_id` and the student's `user_id` (same person)

**Risk:** Any future reconciliation must do a multi-table join via `admission_offers` — fragile and not indexed for this query pattern.

### Gap 2: Application Fee Not Visible in Finance Module

The finance team sees payments in the **Online Payments History** tab (sourced from `fee_payments`). Application fees stored in `student_applications` are invisible to them. There is no combined view.

**Risk:** Finance cannot verify if a student has already paid. They must manually cross-reference the admissions module.

### Gap 3: REGISTRATION Fee Type in Finance ≠ Application Fee

The finance module has a `REGISTRATION` fee type in `fee_structures`. The admission process has its own "application fee" concept. These are treated as entirely separate things, but conceptually they represent the same onboarding cost — creating confusion:

- Is the `REGISTRATION` fee in the finance structure meant to replace the application fee?
- Is it an additional fee on top of the application fee?
- Should the application fee be credited against the `REGISTRATION` invoice?

**Currently: no policy is enforced in code** — the decision is left to whichever admin happens to generate invoices.

### Gap 4: No Automatic Invoice Generation on Enrollment

When `initiateEnrollment()` runs, no invoices are created. The student exists in the system but has zero financial records. Finance must be manually notified and must manually trigger auto-generation.

**Risk:** Students can be enrolled but invisible to the finance module, leading to missed billing.

### Gap 5: No Reconciliation Report

There is no report or dashboard view that shows:
- How many enrolled students have paid their application fee
- Whether those students' invoices have been credited
- Which application payments are "orphaned" (no matching enrolled student yet)
- Which enrolled students have no invoices generated yet

---

## 3. Impact Assessment

| Scenario | Current Outcome | Expected Outcome |
|----------|-----------------|------------------|
| Applicant pays 5,000 RWF, gets enrolled, invoices generated | Student owes full 650,000 RWF | Student owes 645,000 RWF (credited) |
| Finance generates REGISTRATION invoice (100,000 RWF) for a first-year student | Full 100,000 RWF owed | Depends on policy: 95,000 or 0 if app fee counts as partial/full registration |
| Finance tries to reconcile application payments with billing | Must manually check admissions module | No automated reconciliation path |
| New student cannot afford registration because double-billed | Student complaint, manual correction | Prevented by automatic credit |
| Auditor checks that all application fees are accounted for | No consolidated view | No consolidated view (Gap 2) |

---

## 4. Proposed Solution

### 4.1 Policy Decision Required First

Before any code change, the institution must decide:

> **"Does the application fee (RWF 5,000) count toward, or offset, the REGISTRATION fee in the finance system?"**

Three options:

| Option | Meaning | Code Action |
|--------|---------|-------------|
| **A — Deduction** | Application fee is a deposit that reduces registration invoice | Credit 5,000 RWF against REGISTRATION invoice at enrollment |
| **B — Separate** | Application fee is independent administrative cost; REGISTRATION is a different fee | No credit — but create a fee_payments record for audit trail only |
| **C — Replacement** | Application fee IS the registration fee; no separate REGISTRATION invoice for enrolled students | Skip REGISTRATION invoice generation if application already paid |

**Recommended: Option A (Deduction)** — most fair to students and cleanest audit trail.

---

### 4.2 Database Changes

#### Migration: Link application to student

```sql
-- Migration: add_student_id_to_applications.sql
ALTER TABLE `student_applications`
  ADD COLUMN `enrolled_student_id` VARCHAR(20) NULL DEFAULT NULL
    COMMENT 'Populated when applicant is enrolled (FK to students.regnumber)'
    AFTER `status`,
  ADD INDEX `idx_enrolled_student_id` (`enrolled_student_id`);
```

#### Migration: Tag fee_payments with application reference

```sql
-- Already possible via existing reference_number column in fee_payments.
-- Add a source type column for clarity:
ALTER TABLE `fee_payments`
  ADD COLUMN `source` ENUM('MANUAL','GATEWAY','APPLICATION_TRANSFER') 
    NOT NULL DEFAULT 'MANUAL'
    AFTER `payment_method`,
  ADD COLUMN `source_application_id` INT UNSIGNED NULL DEFAULT NULL
    COMMENT 'FK to student_applications.id when source=APPLICATION_TRANSFER'
    AFTER `source`;
```

---

### 4.3 Service Layer Changes

#### In `ApplicationService::initiateEnrollment()`

After creating the student row, add:

```php
// Step A: Store the student ID back on the application
$this->db->execute(
    "UPDATE student_applications 
     SET enrolled_student_id = ?, updated_at = NOW() 
     WHERE id = ?",
    [$newStudentRegNumber, $applicationId]
);

// Step B: If application fee was paid, transfer it to finance system
if (!empty($originalApplication['paid_at']) && $originalApplication['payment_amount'] > 0) {
    $this->feeService->transferApplicationFeeToStudentAccount(
        studentId: $newStudentRegNumber,
        academicYearId: $academicYearId,
        amount: (float)$originalApplication['payment_amount'],
        transactionRef: $originalApplication['transaction_id'],
        applicationId: $applicationId,
        actorId: $actorId
    );
}

// Step C: Auto-generate invoices immediately (no longer requires manual trigger)
$this->feeService->autoGenerateInvoices(
    studentId: $newStudentRegNumber,
    academicYearId: $academicYearId,
    semester: null,
    actorId: $actorId
);
```

#### New Method in `FeeService`

```php
/**
 * Transfers the application fee already paid by an applicant 
 * into the student billing system as a credit.
 * 
 * Called once at enrollment. Idempotent — safe to call twice.
 */
public function transferApplicationFeeToStudentAccount(
    string $studentId,
    int $academicYearId,
    float $amount,
    string $transactionRef,
    int $applicationId,
    int $actorId
): void {
    // Guard: already transferred?
    $existing = $this->feePaymentModel->findBySourceApplication($applicationId);
    if ($existing) return;

    // Find or create the REGISTRATION invoice for this student
    $invoice = $this->feeInvoiceModel->findByStudentAndType(
        $studentId, $academicYearId, 'REGISTRATION'
    );

    if (!$invoice) {
        // Create a holding credit invoice if no REGISTRATION structure exists
        $invoice = $this->createAdHocInvoice(
            studentId: $studentId,
            academicYearId: $academicYearId,
            feeType: 'REGISTRATION',
            description: 'Application fee transfer from admissions',
            amountDue: 0.00,
            actorId: $actorId
        );
    }

    // Create the payment record
    $this->feePaymentModel->create([
        'invoice_id'           => $invoice['id'],
        'student_id'           => $studentId,
        'amount'               => $amount,
        'payment_method'       => 'MOBILE_MONEY',
        'payment_sub_method'   => 'URUBUTO',
        'reference_number'     => $transactionRef,
        'source'               => 'APPLICATION_TRANSFER',
        'source_application_id'=> $applicationId,
        'status'               => 'confirmed',
        'paid_at'              => date('Y-m-d H:i:s'),
        'recorded_by'          => $actorId,
    ]);

    // Apply credit to the invoice
    $this->feeInvoiceModel->applyPayment($invoice['id'], $amount);
}
```

---

### 4.4 Reconciliation Report

#### New API Endpoint

```
GET /api/finance/reports/application-fee-reconciliation
    ?academic_year_id=1
    &status=all|transferred|pending|enrolled_no_invoice
```

**Response shape:**

```json
{
  "summary": {
    "total_applications_paid": 245,
    "total_application_amount": 1225000,
    "enrolled_with_transfer": 198,
    "enrolled_without_transfer": 12,
    "not_yet_enrolled": 35
  },
  "rows": [
    {
      "application_number": "APP-2026-00001",
      "applicant_name": "Jean Paul Habimana",
      "application_paid_at": "2026-03-12 10:22:00",
      "application_amount": 5000,
      "application_tx_ref": "UP-CSJQP1JM",
      "enrolled": true,
      "student_id": "1CUR26AK012653",
      "transfer_status": "transferred",
      "registration_invoice_id": 412,
      "registration_invoice_status": "partial"
    }
  ]
}
```

#### New React Page

A **"Application Fee Reconciliation"** report page under the Finance → Reports tab:

- Filter by academic year
- Table showing all paid applications with enrollment and transfer status
- Color-coded rows: green = transferred, amber = enrolled but not transferred, red = anomaly
- Bulk action: "Transfer selected application fees to student accounts"
- Export to CSV/Excel

---

### 4.5 Finance Dashboard Card Enhancement

Add a card to the Finance Overview showing:

```
┌─────────────────────────────────────────────────────┐
│  Application Fee Tracking          2025/2026        │
│                                                     │
│  Total Application Payments Received:  RWF 1,225,000│
│  Transferred to Student Accounts:      RWF 990,000  │
│  Pending Transfer (enrolled):          RWF   60,000 │
│  Not Enrolled Yet:                     RWF  175,000 │
│                                                     │
│  [Run Transfer for Pending Students]  [Full Report] │
└─────────────────────────────────────────────────────┘
```

---

## 5. Implementation Roadmap

### Phase 1 — Database & Audit Trail (Week 1)

| Task | File | Priority |
|------|------|----------|
| Add `enrolled_student_id` to `student_applications` | New migration | Critical |
| Add `source` + `source_application_id` to `fee_payments` | New migration | Critical |
| Backfill `enrolled_student_id` for existing enrolled applicants (via `admission_offers` join) | SQL script | High |

### Phase 2 — Auto-Transfer on Enrollment (Week 2)

| Task | File | Priority |
|------|------|----------|
| Add `FeeService::transferApplicationFeeToStudentAccount()` | `FeeService.php` | Critical |
| Update `ApplicationService::initiateEnrollment()` to call transfer + auto-invoice | `ApplicationService.php` | Critical |
| Add `FeePaymentModel::findBySourceApplication()` | `FeePaymentModel.php` | High |
| Unit test transfer logic (idempotency, edge cases) | `tests/` | High |

### Phase 3 — Reconciliation Report (Week 3)

| Task | File | Priority |
|------|------|----------|
| New controller: `FinanceReportController::applicationFeeReconciliation()` | New controller | High |
| New route: `GET /api/finance/reports/application-fee-reconciliation` | `routes/api/finance.php` | High |
| React page: `ApplicationFeeReconciliationPage.tsx` | New page | High |
| Add route to Finance sidebar navigation | `FinanceLayout.tsx` | Medium |

### Phase 4 — Backfill & Bulk Fix (Week 4)

| Task | File | Priority |
|------|------|----------|
| Bulk transfer script for all already-enrolled students with unpaid app transfer | `scripts/backfill_app_fee_transfer.php` | High |
| Finance dashboard card for transfer status | `FinanceOverviewPage.tsx` | Medium |
| Export CSV/Excel from reconciliation report | `FinanceReportController.php` | Medium |

---

## 6. Data Flow After Fix

```
┌─ PUBLIC APPLY PORTAL ─────────────────────────────────────────┐
│                                                                 │
│  Applicant pays RWF 5,000 via UrubutoPay                       │
│         ↓                                                        │
│  student_applications:                                          │
│    transaction_id = "UP-CSJQP1JM"                             │
│    payment_amount = 5,000                                       │
│    paid_at = 2026-06-15                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─ ADMIN ENROLLMENT (ApplicationService) ───────────────────────┐
│                                                                 │
│  initiateEnrollment() called                                    │
│    1. Create student row → "STD/2026/00001"                    │
│    2. UPDATE student_applications.enrolled_student_id          │
│       = "STD/2026/00001"   ← NEW                              │
│    3. FeeService::transferApplicationFeeToStudentAccount()     │
│       ← NEW — creates fee_payments row with                   │
│         source = APPLICATION_TRANSFER                           │
│         amount = 5,000                                          │
│         invoice_id = (REGISTRATION invoice or new ad-hoc)     │
│    4. FeeService::autoGenerateInvoices()  ← NOW AUTOMATIC     │
│       Creates:                                                  │
│         TUITION:      500,000 RWF  (status = unpaid)          │
│         REGISTRATION: 100,000 RWF  (status = partial*)        │
│                                                                 │
│  *REGISTRATION starts partial because 5,000 already credited   │
│   Student owes: 95,000 on REGISTRATION, 500,000 on TUITION    │
│   Total: 595,000 RWF (not 650,000)                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─ FINANCE MODULE ──────────────────────────────────────────────┐
│                                                                 │
│  Finance sees immediately on enrollment:                        │
│    fee_invoices for STD/2026/00001:                           │
│      TUITION       → 500,000 RWF   (unpaid)                  │
│      REGISTRATION  →  95,000 RWF   (partial, 5k credited)    │
│    Total owing: 595,000 RWF                                    │
│                                                                 │
│  fee_payments for STD/2026/00001:                             │
│    5,000 RWF | APPLICATION_TRANSFER | ref: UP-CSJQP1JM       │
│                                                                 │
│  Online Payments History tab:                                  │
│    "UP-CSJQP1JM" appears as APPLICATION_TRANSFER row          │
│    Linked to student + registration invoice                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Key Files Reference

### Backend — Requires Changes

| File | Change Type | What to Add/Modify |
|------|-------------|-------------------|
| `backend/app/Services/ApplicationService.php` | Modify | Add transfer call + auto-invoice on enrollment |
| `backend/app/Services/FeeService.php` | Modify | Add `transferApplicationFeeToStudentAccount()` |
| `backend/app/Models/FeePaymentModel.php` | Modify | Add `findBySourceApplication()` |
| `backend/app/Models/FeeInvoiceModel.php` | Modify | Add `findByStudentAndType()` |
| `backend/app/Controllers/FeeController.php` | Modify | Add reconciliation endpoint |

### Backend — New Files

| File | Purpose |
|------|---------|
| `backend/app/Controllers/FinanceReportController.php` | Application fee reconciliation API |
| `backend/database/migrations/YYYY_add_app_link_columns.sql` | DB changes |
| `backend/scripts/backfill_app_fee_transfer.php` | One-time backfill script |

### Frontend — Requires Changes

| File | Change Type | What to Add |
|------|-------------|-------------|
| `frontend/src/pages/finance/FinanceOverviewPage.tsx` | Modify | Add application fee tracking card |

### Frontend — New Files

| File | Purpose |
|------|---------|
| `frontend/src/pages/finance/ApplicationFeeReconciliationPage.tsx` | Full reconciliation report |
| `frontend/src/components/finance/AppFeeTransferCard.tsx` | Dashboard summary card |

---

## 8. Open Questions for Finance Office

Before implementation begins, the following decisions are needed:

1. **Credit policy:** Does the application fee (RWF 5,000) reduce the REGISTRATION invoice, or is it tracked separately as an "application" category in finance?

2. **What is the purpose of the REGISTRATION fee type in fee_structures?** Is it:
   - The annual student registration fee (paid every year)?
   - The one-time first-enrollment fee (paid only by new students)?
   - Something the application fee is meant to partially satisfy?

3. **Backfill scope:** How many students enrolled in 2025/2026 need their application payments retroactively credited? Should the backfill script run for all academic years or only the current one?

4. **Partial credit handling:** If the application fee (5,000 RWF) is less than the REGISTRATION invoice (e.g., 100,000 RWF), should the invoice show `amount_paid = 5,000, status = partial`? Or should it be tracked as a bursary credit?

5. **Display in student portal:** Should enrolled students see their application payment in their payment history on the student portal, with a note "Transferred from application fee"?

---

## 9. Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Double-transfer (transfer runs twice) | Low | High — double credits | Idempotency guard in `findBySourceApplication()` |
| Backfill corrupts existing invoices | Medium | High | Run in dry-run mode first; wrap in transaction |
| Old application payments with no `paid_at` get transferred | Low | Medium | Guard: only transfer if `paid_at IS NOT NULL AND payment_amount > 0` |
| Finance module doesn't find matching fee_structure for REGISTRATION | Medium | Low | Fall back to ad-hoc invoice with `is_system_generated = 0` |
| Student enrolled under wrong academic year invoiced incorrectly | Low | High | Pass `academic_year_id` explicitly from enrollment context |

---

## Appendix A: SQL Reconciliation Query (For Immediate Use)

This query can be run now to audit the current state — no code changes required:

```sql
-- Current state: enrolled students and their application payment status
SELECT
    sa.application_number,
    CONCAT(sa.first_name, ' ', sa.last_name) AS applicant_name,
    sa.email,
    sa.payment_amount                          AS application_fee_paid,
    sa.transaction_id                          AS application_tx_ref,
    sa.paid_at                                 AS application_paid_at,
    sa.status                                  AS application_status,
    ao.student_id                              AS enrolled_student_id,
    ao.enrolled_at,
    -- Check if finance has any invoices for this student
    (SELECT COUNT(*) FROM fee_invoices fi 
     WHERE fi.student_id = ao.student_id)      AS invoice_count,
    -- Check if REGISTRATION invoice exists
    (SELECT fi.status FROM fee_invoices fi 
     WHERE fi.student_id = ao.student_id 
       AND fi.fee_type = 'REGISTRATION' 
     LIMIT 1)                                  AS registration_invoice_status,
    -- Check if the app payment tx_ref exists in fee_payments
    (SELECT fp.id FROM fee_payments fp 
     WHERE fp.reference_number = sa.transaction_id 
     LIMIT 1)                                  AS payment_transferred_id
FROM student_applications sa
LEFT JOIN admission_offers ao 
    ON ao.application_id = sa.id 
   AND ao.enrollment_initiated = 1
WHERE sa.paid_at IS NOT NULL
  AND sa.payment_amount > 0
ORDER BY sa.paid_at DESC;
```

---

## Appendix B: Glossary

| Term | Meaning in This System |
|------|----------------------|
| Application fee | One-time fee paid by applicant to submit application (RWF 5,000, stored in `student_applications`) |
| Registration fee | Finance module fee type (`REGISTRATION` in `fee_structures`) for enrolled first-year students |
| Application transfer | The act of crediting the application fee against a student's billing account at enrollment |
| Fee structure | Configuration record defining how much a particular fee type costs for a given academic year/department/level |
| Fee invoice | A billing record for a specific student for a specific fee type |
| Fee payment | A payment record applied against a fee invoice |
| Enrollment | The transition from applicant → student, triggered by admin in the Admissions module |
| Auto-generate invoices | The process of creating fee invoices for all enrolled students based on active fee structures |
