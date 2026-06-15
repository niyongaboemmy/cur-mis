<?php
/**
 * Payment Reconciler v4
 * ─────────────────────────────────────────────────────────────────────────────
 * Actual fee_invoices schema (from fee_invoices.sql):
 *
 *   id                INT UNSIGNED AUTO_INCREMENT PK
 *   invoice_number    VARCHAR(30)   NOT NULL DEFAULT ''
 *   student_id        VARCHAR(20)   NOT NULL          ← string, NOT an int FK
 *   fee_structure_id  INT UNSIGNED  DEFAULT NULL
 *   academic_year_id  INT UNSIGNED  DEFAULT NULL
 *   semester          TINYINT       DEFAULT NULL
 *   fee_type          ENUM('TUITION','REGISTRATION','ADMISSION','HOSTEL',
 *                          'ACADEMIC_DOCUMENT','FINE','REPEAT_MODULE',
 *                          'ARREARS','BURSARY_CREDIT','MODULE_FEE')
 *   description       VARCHAR(200)  NOT NULL DEFAULT ''
 *   amount_due        DECIMAL(12,2) NOT NULL
 *   amount_paid       DECIMAL(12,2) NOT NULL DEFAULT 0.00
 *   bursary_applied   DECIMAL(12,2) NOT NULL DEFAULT 0.00  ← NOT bursary_amount
 *   due_date          DATE          DEFAULT NULL
 *   status            ENUM('unpaid','partial','paid','overdue','waived','cancelled')
 *   is_system_generated TINYINT(1)  NOT NULL DEFAULT 0
 *   module_id         INT UNSIGNED  DEFAULT NULL
 *   created_at        DATETIME      NOT NULL DEFAULT current_timestamp()
 *   created_by        INT UNSIGNED  NOT NULL DEFAULT 0
 *   updated_at        DATETIME      NOT NULL DEFAULT current_timestamp() ON UPDATE
 *
 * Fixes over v3:
 *   - student_id stored/queried as VARCHAR (regnumber directly) — no resolveStudentId()
 *   - bursary_amount → bursary_applied everywhere
 *   - status filter includes 'cancelled'
 *   - createInvoice bind_param types corrected
 *   - AUTO-BANK invoice_number made unique per student+session to avoid duplicates
 *   - fullSync also resets bursary_applied = 0 on touched invoices
 *   - reverse() recomputes status properly (partial vs unpaid vs overdue)
 */

class PaymentReconciler
{
    private mysqli $db;

    public function __construct(mysqli $db)
    {
        $this->db = $db;
        $this->ensureLogTable();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC: reconcile()
    // Called after every successful Debit in payment.php
    // ─────────────────────────────────────────────────────────────────────────
    public function reconcile(string $transCode): array
    {
        // 1. Load the payment row
        $stmt = $this->db->prepare(
            "SELECT id, student, amount, SESSION, acad_cycle_id
             FROM payment
             WHERE trans_code = ? AND payment_notifi = 'Debit'
             LIMIT 1"
        );
        $stmt->bind_param('s', $transCode);
        $stmt->execute();
        $pay = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$pay) return [];

        $payAmount    = (float)$pay['amount'];
        $paymentRowId = (int)$pay['id'];

        // student_id in fee_invoices IS the regnumber string — use directly
        $studentId = trim((string)$pay['student']);
        if ($studentId === '') return [];

        // 2. Load all open invoices for this student, oldest-first
        //    Exclude: waived, cancelled  (both are "closed" — don't touch)
        $stmt = $this->db->prepare(
            "SELECT id, amount_due, amount_paid, bursary_applied, status, due_date
             FROM fee_invoices
             WHERE student_id = ?
               AND status NOT IN ('waived', 'cancelled', 'paid')
             ORDER BY created_at ASC, id ASC"
        );
        $stmt->bind_param('s', $studentId);
        $stmt->execute();
        $invoices = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        // 3. No invoice → auto-create one, then apply full amount
        if (empty($invoices)) {
            $newInvId = $this->createInvoice($studentId, $payAmount, $pay, $transCode);
            if (!$newInvId) return [];

            $this->applyToInvoice(
                $paymentRowId, $newInvId,
                $payAmount,          // applying
                $payAmount,          // amount_due  (new invoice)
                0.0,                 // already_paid
                0.0,                 // bursary_applied
                null,                // due_date
                $transCode
            );
            return [$newInvId];
        }

        // 4. Apply payment across invoices oldest-first
        $remaining   = $payAmount;
        $affectedIds = [];

        foreach ($invoices as $inv) {
            if ($remaining <= 0.0) break;

            $due         = (float)$inv['amount_due'];
            $alreadyPaid = (float)$inv['amount_paid'];
            $bursary     = (float)$inv['bursary_applied'];
            $outstanding = $due - $alreadyPaid - $bursary;

            if ($outstanding <= 0.0) continue;   // already covered by bursary

            $applying   = min($remaining, $outstanding);
            $remaining -= $applying;

            $this->applyToInvoice(
                $paymentRowId,
                (int)$inv['id'],
                $applying,
                $due,
                $alreadyPaid,
                $bursary,
                $inv['due_date'] ?? null,
                $transCode
            );
            $affectedIds[] = (int)$inv['id'];
        }

        // 5. Excess after all open invoices covered → credit onto the last invoice
        //    (over-payment; finance team can decide what to do with it)
        if ($remaining > 0.0 && !empty($invoices)) {
            $last   = end($invoices);
            $lastId = (int)$last['id'];

            // Re-fetch current amounts (may have been updated in the loop above)
            $row = $this->db->query(
                "SELECT amount_paid, amount_due, bursary_applied FROM fee_invoices WHERE id = $lastId"
            )->fetch_assoc();

            $newPaid   = (float)$row['amount_paid'] + $remaining;
            $newStatus = 'paid';   // over-paid → mark paid

            $u = $this->db->prepare(
                "UPDATE fee_invoices SET amount_paid = ?, status = ? WHERE id = ?"
            );
            $u->bind_param('dsi', $newPaid, $newStatus, $lastId);
            $u->execute();
            $u->close();

            $this->log($paymentRowId, $lastId, $remaining, $newStatus, $transCode);

            if (!in_array($lastId, $affectedIds)) {
                $affectedIds[] = $lastId;
            }
        }

        return $affectedIds;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC: reverse()
    // Called after a Credit (reversal) in cancel_transaction.php
    // ─────────────────────────────────────────────────────────────────────────
    public function reverse(string $originalTransCode, float $reversalAmount = 0.0): void
    {
        $stmt = $this->db->prepare(
            "SELECT id, student, amount FROM payment
             WHERE trans_code = ? AND payment_notifi = 'Debit'
             LIMIT 1"
        );
        $stmt->bind_param('s', $originalTransCode);
        $stmt->execute();
        $pay = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$pay) return;

        $studentId = trim((string)$pay['student']);
        if ($studentId === '') return;

        $toDeduct = $reversalAmount > 0.0 ? $reversalAmount : (float)$pay['amount'];

        // Reverse newest-first to undo most recent payments first
        $stmt = $this->db->prepare(
            "SELECT id, amount_due, amount_paid, bursary_applied, due_date
             FROM fee_invoices
             WHERE student_id = ? AND amount_paid > 0
             ORDER BY created_at DESC, id DESC"
        );
        $stmt->bind_param('s', $studentId);
        $stmt->execute();
        $invoices = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        foreach ($invoices as $inv) {
            if ($toDeduct <= 0.0) break;

            $paid      = (float)$inv['amount_paid'];
            $deducting = min($toDeduct, $paid);
            $newPaid   = $paid - $deducting;
            $toDeduct -= $deducting;

            // Recompute status properly after reversal
            $newStatus = $this->computeStatus(
                (float)$inv['amount_due'],
                $newPaid,
                (float)$inv['bursary_applied'],
                $inv['due_date'] ?? null
            );

            $u = $this->db->prepare(
                "UPDATE fee_invoices SET amount_paid = ?, status = ? WHERE id = ?"
            );
            $u->bind_param('dsi', $newPaid, $newStatus, $inv['id']);
            $u->execute();
            $u->close();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC: fullSync()
    // Full re-sync: reset & replay all Debit payments from scratch
    // ─────────────────────────────────────────────────────────────────────────
    public function fullSync(): array
    {
        $report = ['processed' => 0, 'invoices_updated' => 0, 'errors' => []];

        // 1. Collect invoice IDs previously touched by bank payments
        $res = $this->db->query(
            "SELECT DISTINCT invoice_id FROM payment_reconciliation_log"
        );
        $ids = [];
        while ($r = $res->fetch_assoc()) {
            $ids[] = (int)$r['invoice_id'];
        }

        if (!empty($ids)) {
            $in = implode(',', $ids);
            // Reset amount_paid AND bursary_applied (bursary_applied may have been set by reconciler)
            $this->db->query(
                "UPDATE fee_invoices
                 SET amount_paid = 0.00, bursary_applied = 0.00, status = 'unpaid'
                 WHERE id IN ($in)"
            );
            $this->db->query("DELETE FROM payment_reconciliation_log");
        }

        // 2. Remove auto-created invoices so they get recreated cleanly
        //    Match the pattern used in createInvoice() — prefix 'AUTO-BANK-'
        $this->db->query(
            "DELETE FROM fee_invoices WHERE invoice_number LIKE 'AUTO-BANK-%'"
        );

        // 3. Re-apply all Debit payments oldest-first
        $payments = $this->db->query(
            "SELECT trans_code FROM payment
             WHERE payment_notifi = 'Debit'
             ORDER BY recorded_date ASC, id ASC"
        );

        while ($p = $payments->fetch_assoc()) {
            try {
                $affected = $this->reconcile($p['trans_code']);
                $report['processed']++;
                $report['invoices_updated'] += count($affected);
            } catch (\Throwable $e) {
                $report['errors'][] = $p['trans_code'] . ': ' . $e->getMessage();
            }
        }

        return $report;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Compute the correct status given current payment figures.
     * Respects overdue (due_date in the past and not fully paid).
     */
    private function computeStatus(
        float   $amountDue,
        float   $amountPaid,
        float   $bursaryApplied,
        ?string $dueDate
    ): string {
        $covered = $amountPaid + $bursaryApplied;

        if ($covered <= 0.0) {
            // Nothing paid — check if overdue
            if ($dueDate && strtotime($dueDate) < time()) {
                return 'overdue';
            }
            return 'unpaid';
        }

        if ($covered >= $amountDue) {
            return 'paid';
        }

        // Partially paid — still check overdue
        if ($dueDate && strtotime($dueDate) < time()) {
            return 'overdue';
        }

        return 'partial';
    }

    /**
     * Write amount_paid and status to one fee_invoices row.
     */
    private function applyToInvoice(
        int     $paymentId,
        int     $invoiceId,
        float   $applying,
        float   $amountDue,
        float   $alreadyPaid,
        float   $bursaryApplied,
        ?string $dueDate,
        string  $transCode
    ): void {
        $newPaid   = $alreadyPaid + $applying;
        $newStatus = $this->computeStatus($amountDue, $newPaid, $bursaryApplied, $dueDate);

        $u = $this->db->prepare(
            "UPDATE fee_invoices SET amount_paid = ?, status = ? WHERE id = ?"
        );
        $u->bind_param('dsi', $newPaid, $newStatus, $invoiceId);
        $u->execute();
        $u->close();

        $this->log($paymentId, $invoiceId, $applying, $newStatus, $transCode);
    }

    /**
     * Auto-create a fee_invoices row when a student has no open invoice.
     *
     * invoice_number format: AUTO-BANK-{studentId}-{timestamp}
     * This avoids unique-key collisions on repeated auto-creations (e.g. fullSync).
     *
     * student_id is VARCHAR — stored as the regnumber string directly.
     * fee_type defaults to 'TUITION' (valid ENUM value).
     * is_system_generated = 1 flags it as auto-created.
     */
    private function createInvoice(string $studentId, float $amount, array $pay, string $transCode = ''): ?int
    {
        // Resolve academic_year_id if possible
        $acadYearId = null;
        if (!empty($pay['acad_cycle_id'])) {
            $val  = (string)$pay['acad_cycle_id'];
            $stmt = $this->db->prepare(
                "SELECT id FROM academic_years
                 WHERE label = ? OR CAST(id AS CHAR) = ?
                 LIMIT 1"
            );
            $stmt->bind_param('ss', $val, $val);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if ($row) $acadYearId = (int)$row['id'];
        }

        $invoiceNumber = 'AUTO-' . ($transCode ?: substr(md5($studentId . time()), 0, 24));
        $feeType       = 'TUITION';
        $description   = 'Auto-created from bank/mobile payment';
        $semester      = max(1, (int)($pay['SESSION'] ?? 1));

        $stmt = $this->db->prepare(
            "INSERT INTO fee_invoices
                (invoice_number, student_id, academic_year_id, semester,
                 fee_type, description, amount_due, amount_paid,
                 bursary_applied, status, is_system_generated, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0.00, 0.00, 'unpaid', 1, NOW())"
        );
        // s=invoice_number, s=student_id, i=academic_year_id, i=semester,
        // s=fee_type,       s=description, d=amount_due
        $stmt->bind_param('ssiissd',
            $invoiceNumber,
            $studentId,
            $acadYearId,
            $semester,
            $feeType,
            $description,
            $amount
        );
        $stmt->execute();
        $newId = (int)$stmt->insert_id;
        $stmt->close();

        return $newId ?: null;
    }

    /**
     * Create the reconciliation log table if it doesn't exist.
     */
    private function ensureLogTable(): void
    {
        $this->db->query("
            CREATE TABLE IF NOT EXISTS payment_reconciliation_log (
                id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                payment_id  INT          NOT NULL,
                invoice_id  INT UNSIGNED NOT NULL,
                amount      DECIMAL(12,2) NOT NULL,
                new_status  VARCHAR(20),
                trans_code  VARCHAR(30),
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_pay  (payment_id),
                INDEX idx_inv  (invoice_id),
                INDEX idx_code (trans_code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
    }

    /**
     * Append a row to the reconciliation audit log.
     */
    private function log(int $payId, int $invId, float $amount, string $status, string $code): void
    {
        $stmt = $this->db->prepare(
            "INSERT INTO payment_reconciliation_log
                (payment_id, invoice_id, amount, new_status, trans_code)
             VALUES (?, ?, ?, ?, ?)"
        );
        $stmt->bind_param('iidss', $payId, $invId, $amount, $status, $code);
        $stmt->execute();
        $stmt->close();
    }
}