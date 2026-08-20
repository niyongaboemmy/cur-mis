# Implementation Plan: Application Fee → Finance Fee Type Mapping

**Prepared by:** Senior Systems Analyst  
**Date:** 2026-06-29  
**Based on:** REGISTRATION_FEE_RECONCILIATION.md deep analysis  
**Branch:** `emmy`

---

## Summary of the Idea

Add a configurable setting in the database that declares **which finance fee type** the application fee payment should be matched to. With this single pivot, the entire reconciliation problem becomes solvable:

- Finance knows exactly which invoice category to check against an application payment
- The credit is applied automatically at enrollment (no manual work)
- Reporting queries a single unified ledger — no cross-module manual matching
- Admins can change the mapping at any time from the UI without touching code

---

## What We Know From Code Analysis

| Finding | File | Significance |
|---------|------|--------------|
| `settings` table exists with upsert pattern | `SettingModel.php` | Ready — no new table needed |
| `fee_types` table has `REGISTRATION`, `ADMISSION` etc. as named codes | `2026_05_16_064_create_fee_types_table.sql` | Fee type codes are the mapping target |
| `initiateEnrollment()` already calls `autoGenerateInvoices()` | `ApplicationService.php:590` | Invoices already exist when we need to credit |
| Application fee amount comes from `$_ENV['URUBUTOPAY_APPLICATION_FEE'] ?? 5000` | `UrubutoPayService.php:645` | Move to `settings` table so it's UI-editable |
| `FeeInvoiceModel::studentHasInvoice()` and `applyPayment()` exist | `FeeInvoiceModel.php` | Can find and credit the right invoice already |
| `fee_payments` has `reference_number` column | migration 051 | Can store the UrubutoPay tx ref for the transfer |
| `SystemBasicsController::upsertSetting()` private helper exists | `SystemBasicsController.php:118` | Pattern to replicate for a new settings endpoint |

**Critical finding:** `initiateEnrollment()` already auto-generates invoices (line 590). The REGISTRATION invoice already exists when enrollment completes. We only need to add the credit step immediately after.

---

## Three New Settings Keys

All go into the existing `settings` table — no new table required.

| `key_name` | Default `value` | Description |
|------------|-----------------|-------------|
| `application_fee_mapped_fee_type` | `REGISTRATION` | The `fee_types.code` this payment counts toward in reporting and billing |
| `application_fee_amount` | `5000` | RWF amount charged to applicants (moves from .env to DB) |
| `application_fee_credit_on_enrollment` | `1` | `1` = auto-credit the mapped invoice at enrollment; `0` = track for reporting only |

---

## Architecture: How It All Fits

```
SETTINGS TABLE
  application_fee_mapped_fee_type = "REGISTRATION"
  application_fee_amount          = "5000"
  application_fee_credit_on_enrollment = "1"
          │
          │ read at enrollment
          ▼
ApplicationService::initiateEnrollment()
  1. Create student row                          ← already exists
  2. auto-generate invoices (TUITION, REGISTRATION, ...) ← already exists (line 590)
  3. [NEW] FeeService::creditApplicationFee()
       │ reads setting → fee_type = "REGISTRATION"
       │ finds fee_invoices WHERE student_id = ? AND fee_type = "REGISTRATION"
       │ creates fee_payments row:
       │   amount            = 5000
       │   invoice_id        = (REGISTRATION invoice id)
       │   reference_number  = student_applications.transaction_id
       │   source            = "APPLICATION_TRANSFER"
       │   source_app_id     = student_applications.id
       └─ calls FeeInvoiceModel::applyPayment() → REGISTRATION invoice gets credited

RESULT IN FINANCE MODULE:
  fee_invoices (REGISTRATION):
    amount_due  = 100,000
    amount_paid = 5,000      ← auto-credited
    status      = "partial"

  fee_payments:
    amount           = 5,000
    fee_type         = "REGISTRATION"
    source           = "APPLICATION_TRANSFER"
    reference_number = "UP-CSJQP1JM"
    ← visible in Online Payments History tab
```

---

## Implementation Plan — Step by Step

---

### Step 1 — Database Migration

**File to create:** `backend/database/migrations/2026_06_29_080_fee_mapping_settings.sql`

```sql
-- ─── 1a. Seed the three new settings ───────────────────────────────────────
INSERT INTO `settings` (`key_name`, `value`, `description`) VALUES
  ('application_fee_mapped_fee_type',
   'REGISTRATION',
   'The fee_types.code that application fee payments are matched to in billing and reports.'),
  ('application_fee_amount',
   '5000',
   'RWF amount charged to applicants at application submission (used by UrubutoPay checkout).'),
  ('application_fee_credit_on_enrollment',
   '1',
   '1 = auto-credit the mapped invoice when student is enrolled; 0 = reporting only.')
ON DUPLICATE KEY UPDATE description = VALUES(description);
-- ON DUPLICATE KEY: if keys already exist (re-run safety), keep the admin's saved value

-- ─── 1b. Add source tracking columns to fee_payments ────────────────────────
ALTER TABLE `fee_payments`
  ADD COLUMN IF NOT EXISTS `source` 
    ENUM('MANUAL','GATEWAY','APPLICATION_TRANSFER') NOT NULL DEFAULT 'MANUAL'
    COMMENT 'How this payment entered the system'
    AFTER `payment_method`,
  ADD COLUMN IF NOT EXISTS `source_application_id`
    INT UNSIGNED NULL DEFAULT NULL
    COMMENT 'FK to student_applications.id when source=APPLICATION_TRANSFER'
    AFTER `source`;

-- Index for reconciliation queries
ALTER TABLE `fee_payments`
  ADD INDEX IF NOT EXISTS `idx_fp_source` (`source`),
  ADD INDEX IF NOT EXISTS `idx_fp_source_app` (`source_application_id`);

-- ─── 1c. Add enrolled_student_id to student_applications ────────────────────
ALTER TABLE `student_applications`
  ADD COLUMN IF NOT EXISTS `enrolled_student_id` VARCHAR(20) NULL DEFAULT NULL
    COMMENT 'Set when applicant enrolls: FK to student.regnumber'
    AFTER `status`,
  ADD INDEX IF NOT EXISTS `idx_sa_enrolled_student` (`enrolled_student_id`);
```

---

### Step 2 — Backend: New API Endpoint for Fee Mapping Settings

**File to modify:** `backend/app/Controllers/SystemBasicsController.php`

Add two public methods after `saveGuidanceVideos()`:

```php
/**
 * GET /api/system/fee-mapping
 * Admin-only — fetch the three application fee mapping settings.
 */
public function getFeeMappingSettings(Request $request, Response $response): never
{
    $keys = [
        'application_fee_mapped_fee_type',
        'application_fee_amount',
        'application_fee_credit_on_enrollment',
    ];

    $result = [];
    foreach ($keys as $key) {
        $row = $this->settingModel->findBy('key_name', $key);
        $result[$key] = $row ? $row['value'] : null;
    }

    // Also return available fee type codes for the dropdown
    $db        = \Core\Database::getInstance();
    $feeTypes  = $db->fetchAll(
        "SELECT code, label FROM `fee_types` WHERE is_active = 1 ORDER BY sort_order",
        []
    );

    $this->success($response, [
        'settings'   => $result,
        'fee_types'  => $feeTypes,
    ], 'Fee mapping settings fetched.');
}

/**
 * PUT /api/system/fee-mapping
 * Admin-only — persist the fee mapping settings.
 */
public function saveFeeMappingSettings(Request $request, Response $response): never
{
    $data = $request->body();

    $mappedFeeType  = strtoupper(trim((string)($data['application_fee_mapped_fee_type'] ?? '')));
    $feeAmount      = (int)($data['application_fee_amount'] ?? 0);
    $autoCredit     = (int)(bool)($data['application_fee_credit_on_enrollment'] ?? 1);

    // Validate fee type exists
    $db  = \Core\Database::getInstance();
    $ft  = $db->fetchOne("SELECT code FROM `fee_types` WHERE code = ? AND is_active = 1", [$mappedFeeType]);
    if (!$ft) {
        $this->error($response, "Fee type '{$mappedFeeType}' does not exist or is inactive.", 422);
    }

    if ($feeAmount < 0 || $feeAmount > 10_000_000) {
        $this->error($response, 'Application fee amount must be between 0 and 10,000,000 RWF.', 422);
    }

    $this->upsertSetting(
        'application_fee_mapped_fee_type',
        $mappedFeeType,
        'The fee_types.code that application fee payments are matched to in billing and reports.'
    );
    $this->upsertSetting(
        'application_fee_amount',
        (string)$feeAmount,
        'RWF amount charged to applicants at application submission.'
    );
    $this->upsertSetting(
        'application_fee_credit_on_enrollment',
        (string)$autoCredit,
        '1 = auto-credit the mapped invoice when student is enrolled; 0 = reporting only.'
    );

    $this->success($response, [
        'application_fee_mapped_fee_type'      => $mappedFeeType,
        'application_fee_amount'               => $feeAmount,
        'application_fee_credit_on_enrollment' => $autoCredit,
    ], 'Fee mapping settings saved.');
}
```

**Modify `upsertSetting()` visibility** — change `private` to `protected` so subclasses can use it, or just replicate the pattern inline.

---

### Step 3 — Backend: Routes

**File to modify:** `backend/routes/api/system.php`

Add after the existing `guidance-videos` route:

```php
// Fee mapping settings — admin read/write.
$router->group('/api/system', function ($router) {
    $router->get('/fee-mapping',  [SystemBasicsController::class, 'getFeeMappingSettings']);
    $router->put('/fee-mapping',  [SystemBasicsController::class, 'saveFeeMappingSettings']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_SETTINGS)]);
```

---

### Step 4 — Backend: UrubutoPayService reads fee amount from DB

**File to modify:** `backend/app/Services/UrubutoPayService.php`

Change `applicationFee()` (line 644):

```php
// BEFORE:
private function applicationFee(): int
{
    return (int)($_ENV['URUBUTOPAY_APPLICATION_FEE'] ?? 5000);
}

// AFTER:
private function applicationFee(): int
{
    // DB setting takes precedence; fall back to env var, then hard default
    $row = $this->db->fetchOne(
        "SELECT value FROM `settings` WHERE key_name = 'application_fee_amount' LIMIT 1",
        []
    );
    if ($row && (int)$row['value'] > 0) {
        return (int)$row['value'];
    }
    return (int)($_ENV['URUBUTOPAY_APPLICATION_FEE'] ?? 5000);
}
```

---

### Step 5 — Backend: New FeeService method

**File to modify:** `backend/app/Services/FeeService.php`

Add this method at the end of the class, before the closing `}`:

```php
/**
 * Credit the application fee a student already paid into the finance system.
 *
 * Reads `application_fee_mapped_fee_type` from settings to know which
 * invoice type to credit. Idempotent — safe to call twice (checks for
 * an existing APPLICATION_TRANSFER payment with the same reference).
 *
 * Called immediately after autoGenerateInvoices() inside
 * ApplicationService::initiateEnrollment().
 */
public function creditApplicationFee(
    string $studentId,
    int    $academicYearId,
    float  $amount,
    string $transactionRef,
    int    $applicationId,
    int    $actorId
): array {
    if ($amount <= 0 || $transactionRef === '') {
        return ['status' => 'skipped', 'reason' => 'no_payment'];
    }

    // Idempotency: already transferred?
    $existing = $this->db->fetchOne(
        "SELECT id FROM `fee_payments`
         WHERE source = 'APPLICATION_TRANSFER'
           AND source_application_id = ?
         LIMIT 1",
        [$applicationId]
    );
    if ($existing) {
        return ['status' => 'duplicate', 'payment_id' => (int)$existing['id']];
    }

    // Read the mapped fee type from settings
    $setting = $this->db->fetchOne(
        "SELECT value FROM `settings` WHERE key_name = 'application_fee_mapped_fee_type' LIMIT 1",
        []
    );
    $mappedFeeType = trim((string)($setting['value'] ?? 'REGISTRATION'));
    if ($mappedFeeType === '') {
        $mappedFeeType = 'REGISTRATION';
    }

    // Find the invoice of the mapped type for this student + year
    $invoice = $this->db->fetchOne(
        "SELECT id, amount_due, amount_paid, bursary_applied, status
         FROM `fee_invoices`
         WHERE student_id COLLATE utf8mb4_unicode_ci = ?
           AND academic_year_id = ?
           AND fee_type = ?
         ORDER BY id ASC
         LIMIT 1",
        [$studentId, $academicYearId, $mappedFeeType]
    );

    if (!$invoice) {
        // No matching invoice — create an ad-hoc zero-due invoice to hold the credit
        $invoiceId = (int)$this->invoiceModel->create([
            'invoice_number'      => $this->generateInvoiceNumber(),
            'student_id'          => $studentId,
            'academic_year_id'    => $academicYearId,
            'fee_type'            => $mappedFeeType,
            'description'         => 'Application fee transfer (no matching structure found)',
            'amount_due'          => 0.00,
            'amount_paid'         => 0.00,
            'is_system_generated' => 1,
            'created_by'          => $actorId,
        ]);
    } else {
        $invoiceId = (int)$invoice['id'];
    }

    // Create the payment record
    $paymentId = (int)$this->paymentModel->create([
        'invoice_id'              => $invoiceId,
        'student_id'              => $studentId,
        'amount'                  => $amount,
        'payment_method'          => 'MOBILE_MONEY',
        'source'                  => 'APPLICATION_TRANSFER',
        'source_application_id'   => $applicationId,
        'reference_number'        => $transactionRef,
        'receipt_number'          => 'APP-' . strtoupper(substr(md5($transactionRef), 0, 8)),
        'status'                  => 'confirmed',
        'paid_at'                 => date('Y-m-d H:i:s'),
        'recorded_by'             => $actorId,
        'notes'                   => "Transferred from application fee (ref: {$transactionRef})",
    ]);

    // Apply the credit to the invoice
    $this->invoiceModel->applyPayment($invoiceId, $amount);

    SystemLogService::log(
        'CREATE',
        'FINANCE',
        "Application fee RWF {$amount} transferred to {$mappedFeeType} invoice #{$invoiceId} "
        . "for student {$studentId}. Original tx: {$transactionRef}.",
        $paymentId,
        'fee_payment',
        ['mapped_fee_type' => $mappedFeeType, 'invoice_id' => $invoiceId, 'amount' => $amount]
    );

    return [
        'status'          => 'credited',
        'payment_id'      => $paymentId,
        'invoice_id'      => $invoiceId,
        'mapped_fee_type' => $mappedFeeType,
        'amount'          => $amount,
    ];
}
```

---

### Step 6 — Backend: Wire Into Enrollment

**File to modify:** `backend/app/Services/ApplicationService.php`

Replace the existing try block at line 585–594:

```php
// BEFORE (lines 585–594):
// Auto-generate admission + registration fee invoices for the new student
try {
    $academicYearId = (int)($offer['academic_year_id'] ?? 0);
    if ($academicYearId > 0) {
        $feeService = new FeeService();
        $feeService->autoGenerateInvoices($regNumber, $academicYearId, null, $actorId);
    }
} catch (\Exception $e) {
    // Non-blocking: enrollment succeeds even if fee generation fails
}

// AFTER:
$academicYearId = (int)($offer['academic_year_id'] ?? 0);
$feeTransferResult = null;
try {
    if ($academicYearId > 0) {
        $feeService = new FeeService();

        // Generate all standard invoices (TUITION, REGISTRATION, etc.)
        $feeService->autoGenerateInvoices($regNumber, $academicYearId, null, $actorId);

        // Credit application fee into the mapped invoice type (reads from settings)
        $autoCredit = $this->db->fetchOne(
            "SELECT value FROM `settings`
             WHERE key_name = 'application_fee_credit_on_enrollment' LIMIT 1",
            []
        );
        $shouldCredit = (int)($autoCredit['value'] ?? 1) === 1;

        if ($shouldCredit
            && !empty($offer['payment_amount'])
            && (float)$offer['payment_amount'] > 0
            && !empty($offer['transaction_id'])
        ) {
            $feeTransferResult = $feeService->creditApplicationFee(
                studentId:      $regNumber,
                academicYearId: $academicYearId,
                amount:         (float)$offer['payment_amount'],
                transactionRef: (string)$offer['transaction_id'],
                applicationId:  $applicationId,
                actorId:        $actorId
            );
        }
    }
} catch (\Exception $e) {
    // Non-blocking: enrollment succeeds even if fee generation/transfer fails
    $feeTransferResult = ['status' => 'error', 'reason' => $e->getMessage()];
}

// Store enrolled_student_id on the application for easy reconciliation queries
$this->db->execute(
    "UPDATE `student_applications`
     SET enrolled_student_id = ?, updated_at = NOW()
     WHERE id = ?",
    [$regNumber, $applicationId]
);
```

Also update the `return` block to include transfer result:
```php
return [
    'student_id'          => $studentId,
    'regnumber'           => $regNumber,
    'parent_student_id'   => $parentStudent ? (int)$parentStudent['id'] : null,
    'parent_regnumber'    => $parentStudent ? (string)$parentStudent['regnumber'] : null,
    'programme_level'     => $programmeLevel,
    'is_returning'        => $parentStudent !== null,
    'letter_sent'         => !isset($letterResult['error']),
    'letter_error'        => $letterResult['error'] ?? null,
    'fee_transfer'        => $feeTransferResult,  // ← NEW
];
```

**Note:** The code reads `$offer['payment_amount']` and `$offer['transaction_id']`. Verify `getWithApplication()` in `AdmissionOfferModel` joins these columns from `student_applications`. If not, add them to that JOIN.

---

### Step 7 — Backend: Reconciliation Report Endpoint

**File to modify:** `backend/app/Controllers/FeeController.php`

Add new method:

```php
/**
 * GET /api/finance/reports/application-fee-reconciliation
 * Returns a per-application row showing: application payment, 
 * enrollment status, and whether the fee was credited.
 */
public function applicationFeeReconciliation(Request $request, Response $response): never
{
    $yearId = (int)($request->query()['academic_year_id'] ?? 0);
    $status = trim((string)($request->query()['status'] ?? 'all'));
    // status: all | credited | pending | not_enrolled

    $whereYear = $yearId > 0
        ? "AND EXISTS (
             SELECT 1 FROM admission_offers ao2
             WHERE ao2.application_id = sa.id
               AND ao2.academic_year_id = {$yearId}
           )"
        : '';

    $rows = $this->db->fetchAll(
        "SELECT
           sa.id                          AS application_id,
           sa.application_number,
           CONCAT(sa.first_name,' ',sa.last_name) AS applicant_name,
           sa.email,
           sa.payment_amount              AS application_fee_amount,
           sa.transaction_id              AS application_tx_ref,
           sa.paid_at                     AS application_paid_at,
           sa.status                      AS application_status,
           sa.enrolled_student_id,

           -- Invoice the fee was credited to
           fi.id                          AS invoice_id,
           fi.fee_type                    AS invoice_fee_type,
           fi.amount_due                  AS invoice_amount_due,
           fi.amount_paid                 AS invoice_amount_paid,
           fi.status                      AS invoice_status,

           -- The transfer payment record
           fp.id                          AS transfer_payment_id,
           fp.amount                      AS transferred_amount,
           fp.created_at                  AS transferred_at

         FROM `student_applications` sa
         LEFT JOIN `fee_payments` fp
           ON fp.source = 'APPLICATION_TRANSFER'
          AND fp.source_application_id = sa.id
         LEFT JOIN `fee_invoices` fi
           ON fi.id = fp.invoice_id
         WHERE sa.paid_at IS NOT NULL
           AND sa.payment_amount > 0
           {$whereYear}
         ORDER BY sa.paid_at DESC",
        []
    );

    // Filter by requested status
    if ($status !== 'all') {
        $rows = array_filter($rows, function ($r) use ($status) {
            $isCredited    = !empty($r['transfer_payment_id']);
            $isEnrolled    = !empty($r['enrolled_student_id']);
            return match ($status) {
                'credited'     => $isCredited,
                'pending'      => $isEnrolled && !$isCredited,
                'not_enrolled' => !$isEnrolled,
                default        => true,
            };
        });
        $rows = array_values($rows);
    }

    // Summary counts
    $total        = count($rows);
    $credited     = count(array_filter($rows, fn($r) => !empty($r['transfer_payment_id'])));
    $pending      = count(array_filter($rows, fn($r) => !empty($r['enrolled_student_id']) && empty($r['transfer_payment_id'])));
    $notEnrolled  = count(array_filter($rows, fn($r) => empty($r['enrolled_student_id'])));
    $totalAmount  = array_sum(array_column($rows, 'application_fee_amount'));
    $creditedAmt  = array_sum(array_column(
        array_filter($rows, fn($r) => !empty($r['transfer_payment_id'])),
        'transferred_amount'
    ));

    $this->success($response, [
        'summary' => [
            'total_applications'       => $total,
            'total_amount_collected'   => $totalAmount,
            'credited_count'           => $credited,
            'credited_amount'          => $creditedAmt,
            'pending_count'            => $pending,
            'not_enrolled_count'       => $notEnrolled,
        ],
        'rows' => $rows,
    ], 'Application fee reconciliation report.');
}
```

**Add route** in `backend/routes/api/finance.php`:
```php
$router->get('/finance/reports/application-fee-reconciliation',
    [FeeController::class, 'applicationFeeReconciliation']);
```

---

### Step 8 — Frontend: Fee Mapping Settings Panel

**File to create:** `frontend/src/components/finance/FeeMappingPanel.tsx`

This is a settings panel shown inside the Finance module (or as a new tab on `FeeTypesPage`):

```
┌─ Application Fee Mapping ──────────────────────────────────────────────┐
│                                                                         │
│  These settings control how application fees are matched to the        │
│  student billing system when an applicant is enrolled.                 │
│                                                                         │
│  Mapped Fee Type *                                                      │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │  Registration                                             ▼  │      │
│  └──────────────────────────────────────────────────────────────┘      │
│  Application fee payments will be credited against this invoice type.  │
│                                                                         │
│  Application Fee Amount (RWF) *                                        │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │  5,000                                                       │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                         │
│  ☑  Automatically credit fee at enrollment                             │
│     When ON, the fee is credited into the student's account            │
│     immediately when they are enrolled. When OFF, the payment is       │
│     tracked for reporting only (no invoice credit applied).            │
│                                                                         │
│                                             [Cancel]  [Save Settings]  │
└────────────────────────────────────────────────────────────────────────┘
```

**Key implementation notes:**
- Use React Query to load from `GET /api/system/fee-mapping`
- Fee type dropdown populated from `fee_types` array in the same response
- Save calls `PUT /api/system/fee-mapping`
- Show a success toast on save

---

### Step 9 — Frontend: Reconciliation Report Page

**File to create:** `frontend/src/pages/finance/AppFeeReconciliationPage.tsx`

UI layout:

```
┌─ Application Fee Reconciliation ───────────────────────────────────────┐
│  Track application payments matched to student billing accounts.       │
│                                                                         │
│  [Academic Year: 2025/2026 ▼]  [Status: All ▼]  [Export CSV]         │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Total Collected    │  Credited     │  Pending    │ Not Enrolled │  │
│  │  RWF 1,225,000      │  245 students │  12 students│  35 applicants│ │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  APPLICATION NO  │ APPLICANT       │ APP FEE   │ STUDENT ID │ STATUS   │
│  ──────────────────────────────────────────────────────────────────    │
│  APP-2026-00001  │ Jean Paul H.    │ 5,000 RWF │ STD/2026/1 │ ✅ Credited│
│  APP-2026-00002  │ Marie Claire N. │ 5,000 RWF │ STD/2026/2 │ ⏳ Pending │
│  APP-2026-00087  │ Patrick K.      │ 5,000 RWF │ —          │ 🔵 Not enrolled│
│                                                                         │
│  [Run Credit for All Pending Students]                                 │
└────────────────────────────────────────────────────────────────────────┘
```

**"Run Credit for All Pending" button** calls a batch endpoint:

```
POST /api/finance/reports/application-fee-reconciliation/run-pending
Body: { academic_year_id: 1 }
```

This loops all `pending` rows and calls `FeeService::creditApplicationFee()` for each.

---

## File Change Summary

### New Files

| File | Purpose |
|------|---------|
| `backend/database/migrations/2026_06_29_080_fee_mapping_settings.sql` | Settings seed + fee_payments columns + student_applications column |
| `frontend/src/components/finance/FeeMappingPanel.tsx` | Fee mapping settings UI component |
| `frontend/src/pages/finance/AppFeeReconciliationPage.tsx` | Reconciliation report page |

### Modified Files

| File | Change |
|------|--------|
| `backend/app/Controllers/SystemBasicsController.php` | Add `getFeeMappingSettings()` + `saveFeeMappingSettings()`, change `upsertSetting()` to `protected` |
| `backend/routes/api/system.php` | Add 2 routes for fee mapping settings |
| `backend/app/Services/UrubutoPayService.php` | Change `applicationFee()` to read from DB first |
| `backend/app/Services/FeeService.php` | Add `creditApplicationFee()` method |
| `backend/app/Services/ApplicationService.php` | Wire credit transfer + `enrolled_student_id` update into enrollment flow |
| `backend/app/Controllers/FeeController.php` | Add `applicationFeeReconciliation()` + batch run method |
| `backend/routes/api/finance.php` | Add 2 reconciliation report routes |
| `frontend/src/pages/finance/FeeTypesPage.tsx` | Add "Fee Mapping" tab/section |

---

## Execution Order

1. **Run migration** `2026_06_29_080_fee_mapping_settings.sql` — seeds settings, adds columns
2. **Modify `SystemBasicsController`** — expose get/save endpoints
3. **Add routes** in `system.php`
4. **Modify `UrubutoPayService::applicationFee()`** — reads amount from DB
5. **Add `FeeService::creditApplicationFee()`** — core credit logic
6. **Modify `ApplicationService::initiateEnrollment()`** — wire Step 5 into enrollment
7. **Add reconciliation endpoint** in `FeeController`
8. **Add reconciliation routes** in `finance.php`
9. **Build `FeeMappingPanel.tsx`** — settings UI
10. **Build `AppFeeReconciliationPage.tsx`** — report UI
11. **Backfill** — run batch credit for all already-enrolled students with no transfer record

---

## Backfill: Already-Enrolled Students

After all code is deployed, run this once to credit all existing enrolled students:

```sql
-- Find all that need backfilling
SELECT
  sa.id              AS application_id,
  sa.payment_amount,
  sa.transaction_id,
  sa.enrolled_student_id,
  ao.academic_year_id
FROM student_applications sa
JOIN admission_offers ao
  ON ao.application_id = sa.id
  AND ao.enrollment_initiated = 1
WHERE sa.paid_at IS NOT NULL
  AND sa.payment_amount > 0
  AND sa.transaction_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM fee_payments fp
    WHERE fp.source = 'APPLICATION_TRANSFER'
      AND fp.source_application_id = sa.id
  );
```

Then call `POST /api/finance/reports/application-fee-reconciliation/run-pending` from the UI — or run the PHP batch script directly.

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Transfer runs twice (duplicate credit) | Idempotency guard in `creditApplicationFee()` checks `source_application_id` before inserting |
| `application_fee_credit_on_enrollment = 0` — admin turns off auto-credit | Report shows "pending" rows; batch button lets admin run it manually |
| Fee type mapping changed after some students enrolled | Old transfers keep original mapping in `fee_payments.source_application_id`; new enrollments use updated setting |
| No REGISTRATION invoice exists (no matching fee_structure for dept/level) | `creditApplicationFee()` creates an ad-hoc zero-due invoice to hold the credit |
| `getWithApplication()` doesn't return `payment_amount`/`transaction_id` | Must verify the JOIN in `AdmissionOfferModel::getWithApplication()` and add those columns if missing |
| Migration runs on existing `fee_payments` with no `source` column | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is idempotent |

---

## What the Finance Team Gets

After this is implemented:

1. **Zero manual work at enrollment** — application fee credit is automatic
2. **Configurable mapping** — finance can remap to `ADMISSION` or any other type from the UI
3. **Live reconciliation dashboard** — see all application payments, which are credited, which are pending
4. **Unified payment history** — Online Payments History tab shows APPLICATION_TRANSFER rows alongside regular gateway payments
5. **Audit trail** — `fee_payments.source_application_id` links back to the original application
6. **Amount is UI-editable** — no more .env file change needed to update the fee
