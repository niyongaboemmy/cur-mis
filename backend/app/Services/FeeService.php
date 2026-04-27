<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;
use App\Models\FeeStructureModel;
use App\Models\FeeInvoiceModel;
use App\Models\FeePaymentModel;
use App\Models\FeeBursaryModel;
use App\Models\StudentModel;
use App\Models\ExpenseModel;
use App\Models\ExpenseBudgetModel;
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;
use Dompdf\Dompdf;
use Dompdf\Options;
class FeeService
{
    private FeeStructureModel $structureModel;
    private FeeInvoiceModel   $invoiceModel;
    private FeePaymentModel   $paymentModel;
    private FeeBursaryModel   $bursaryModel;
    private StudentModel      $studentModel;
    private ExpenseModel      $expenseModel;
    private ExpenseBudgetModel $budgetModel;
    private Database          $db;

    public function __construct()
    {
        $this->structureModel = new FeeStructureModel();
        $this->invoiceModel   = new FeeInvoiceModel();
        $this->paymentModel   = new FeePaymentModel();
        $this->bursaryModel   = new FeeBursaryModel();
        $this->studentModel   = new StudentModel();
        $this->expenseModel   = new ExpenseModel();
        $this->budgetModel    = new ExpenseBudgetModel();
        $this->db             = Database::getInstance();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Auto-identification — core algorithm
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Auto-generate all applicable invoices for a student in a given academic
     * year / semester.  Skips invoice types that already exist to stay idempotent.
     *
     * @return array{created:int,skipped:int,invoices:int[]}
     */
    public function autoGenerateInvoices(
        string $studentId,
        int    $academicYearId,
        ?int   $semester,
        int    $actorId
    ): array {
        // department column may store numeric dep_id (legacy) or dep_acronym (new enrollment)
        $student = $this->db->fetchOne(
            "SELECT s.*,
                    COALESCE(
                        NULLIF(CAST(s.department AS UNSIGNED), 0),
                        (SELECT dep_id FROM `departements` WHERE dep_acronym = s.department LIMIT 1)
                    ) AS dept_id,
                    CAST(s.current_level AS UNSIGNED) AS lvl_id,
                    ay.start_date AS year_start, ay.end_date AS year_end
             FROM `student` s
             LEFT JOIN `academic_years` ay ON ay.id = ?
             WHERE s.regnumber = ?
             LIMIT 1",
            [$academicYearId, $studentId]
        );

        if (!$student) {
            throw new \RuntimeException("Student not found: {$studentId}");
        }

        $departmentId = $student['dept_id'] ? (int)$student['dept_id'] : null;
        $levelId      = $student['lvl_id']  ? (int)$student['lvl_id']  : null;
        $created      = 0;
        $skipped      = 0;
        $invoiceIds   = [];

        // STEP 1 — Tuition
        $result = $this->createStructuredInvoice(
            $studentId, $academicYearId, $semester, 'TUITION',
            $departmentId, $levelId, $actorId
        );
        $result['created'] ? $created++ : $skipped++;
        if ($result['id']) {
            $invoiceIds[] = $result['id'];
        }

        // STEP 2 — Registration fee (first-time students only)
        if ($this->isFirstYearStudent($student, $academicYearId)) {
            $result = $this->createStructuredInvoice(
                $studentId, $academicYearId, null, 'REGISTRATION',
                $departmentId, $levelId, $actorId
            );
            $result['created'] ? $created++ : $skipped++;
            if ($result['id']) {
                $invoiceIds[] = $result['id'];
            }
        }

        // STEP 3 — Repeat module fees
        $repeatModules = $this->getRepeatModules($studentId, $academicYearId);
        foreach ($repeatModules as $module) {
            if ($this->invoiceModel->studentHasInvoice(
                $studentId, $academicYearId, 'REPEAT_MODULE', (int)$module['module_id']
            )) {
                $skipped++;
                continue;
            }

            $structure = $this->structureModel->findBestMatch(
                $academicYearId, 'REPEAT_MODULE', $departmentId, $levelId, $semester
            );

            $invoiceId = $this->invoiceModel->create([
                'invoice_number'      => $this->generateInvoiceNumber(),
                'student_id'          => $studentId,
                'fee_structure_id'    => $structure ? (int)$structure['id'] : null,
                'academic_year_id'    => $academicYearId,
                'semester'            => $semester,
                'fee_type'            => 'REPEAT_MODULE',
                'description'         => 'Repeat module fee: ' . $module['module_name'],
                'amount_due'          => $structure ? (float)$structure['amount'] : 0.00,
                'is_system_generated' => 1,
                'module_id'           => (int)$module['module_id'],
                'created_by'          => $actorId,
            ]);
            $created++;
            $invoiceIds[] = (int)$invoiceId;
        }

        // STEP 4 — Arrears rollover from previous years
        if (!$this->invoiceModel->studentHasInvoice($studentId, $academicYearId, 'ARREARS')) {
            $arrears = $this->calculateArrears($studentId, $academicYearId);
            if ($arrears > 0) {
                $invoiceId = $this->invoiceModel->create([
                    'invoice_number'      => $this->generateInvoiceNumber(),
                    'student_id'          => $studentId,
                    'academic_year_id'    => $academicYearId,
                    'fee_type'            => 'ARREARS',
                    'description'         => 'Outstanding balance rolled over from previous year(s)',
                    'amount_due'          => $arrears,
                    'is_system_generated' => 1,
                    'created_by'          => $actorId,
                ]);
                $created++;
                $invoiceIds[] = (int)$invoiceId;
            }
        }

        // STEP 5 — Apply bursaries (creates BURSARY_CREDIT lines)
        $this->applyBursaries($studentId, $academicYearId, $actorId);

        return ['created' => $created, 'skipped' => $skipped, 'invoices' => $invoiceIds];
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Bursary distribution
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * For each un-applied bursary, create a BURSARY_CREDIT invoice and
     * update bursary_applied on the matching debit invoice.
     */
    public function applyBursaries(string $studentId, int $academicYearId, int $actorId): void
    {
        // 1. Reset all bursary_applied on this student's invoices for this year
        $this->db->execute(
            "UPDATE `fee_invoices` SET bursary_applied = 0, updated_at = NOW()
             WHERE student_id = ? AND academic_year_id = ?",
            [$studentId, $academicYearId]
        );

        // 2. Get total confirmed bursary amount
        $totalBursary = $this->bursaryModel->totalForStudent($studentId, $academicYearId);

        if ($totalBursary <= 0) {
            // Delete the BURSARY_CREDIT line if it exists and total is now 0
            $this->db->execute(
                "DELETE FROM `fee_invoices` WHERE student_id = ? AND academic_year_id = ? AND fee_type = 'BURSARY_CREDIT'",
                [$studentId, $academicYearId]
            );
            return;
        }

        // 3. Sync the BURSARY_CREDIT line
        $existing = $this->db->fetchOne(
            "SELECT id FROM `fee_invoices` WHERE student_id = ? AND academic_year_id = ? AND fee_type = 'BURSARY_CREDIT' LIMIT 1",
            [$studentId, $academicYearId]
        );

        if ($existing) {
            $this->invoiceModel->update((int)$existing['id'], [
                'bursary_applied' => $totalBursary,
                'status'          => 'paid',
            ]);
        } else {
            $this->invoiceModel->create([
                'invoice_number'      => $this->generateInvoiceNumber(),
                'student_id'          => $studentId,
                'academic_year_id'    => $academicYearId,
                'fee_type'            => 'BURSARY_CREDIT',
                'description'         => 'Bursary/scholarship credit applied',
                'amount_due'          => 0,
                'bursary_applied'     => $totalBursary,
                'status'              => 'paid',
                'is_system_generated' => 1,
                'created_by'          => $actorId,
            ]);
        }

        // 4. Distribute bursary_applied across debit invoices (largest first)
        $remaining = $totalBursary;
        $debitInvoices = $this->invoiceModel->listWithDetails([
            'student_id'       => $studentId,
            'academic_year_id' => $academicYearId,
        ]);

        // Sort by amount_due DESC for optimal distribution
        usort($debitInvoices, fn($a, $b) => (float)$b['amount_due'] <=> (float)$a['amount_due']);

        foreach ($debitInvoices as $inv) {
            if ($remaining <= 0) break;
            if ($inv['fee_type'] === 'BURSARY_CREDIT') continue;

            $gap = (float)$inv['amount_due'] - (float)$inv['amount_paid'];
            if ($gap <= 0) continue;

            $apply = min($remaining, $gap);
            $this->db->execute(
                "UPDATE `fee_invoices`
                 SET bursary_applied = bursary_applied + ?, updated_at = NOW()
                 WHERE id = ?",
                [$apply, (int)$inv['id']]
            );
            $this->invoiceModel->recalculateStatus((int)$inv['id']);
            $remaining -= $apply;
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Payment recording
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Record a payment against an invoice. Updates invoice amount_paid and
     * recalculates its status.
     *
     * @return array{payment_id:int,receipt_number:string}
     */
    public function recordPayment(array $data, int $actorId): array
    {
        $invoiceId = (int)$data['invoice_id'];
        $invoice   = $this->invoiceModel->find($invoiceId);

        if (!$invoice) {
            throw new \RuntimeException('Invoice not found.');
        }
        if ($invoice['status'] === 'paid') {
            throw new \RuntimeException('Invoice is already fully paid.');
        }
        if ($invoice['status'] === 'waived') {
            throw new \RuntimeException('Invoice has been waived.');
        }

        $amount        = (float)$data['amount'];
        $receiptNumber = $this->generateReceiptNumber();

        $paymentId = $this->paymentModel->create([
            'invoice_id'       => $invoiceId,
            'student_id'       => $invoice['student_id'],
            'amount'           => $amount,
            'payment_method'   => $data['payment_method'],
            'reference_number' => $data['reference_number'] ?? null,
            'bank_slip_file_id'=> $data['bank_slip_file_id'] ?? null,
            'receipt_number'   => $receiptNumber,
            'status'           => 'pending',   // requires approval before affecting balance
            'notes'            => $data['notes'] ?? null,
            'recorded_by'      => $actorId,
            'paid_at'          => $data['paid_at'] ?? date('Y-m-d H:i:s'),
        ]);

        // NOTE: invoice amount_paid is NOT updated here.
        // It will be updated when a finance officer approves the payment.

        return ['payment_id' => (int)$paymentId, 'receipt_number' => $receiptNumber];
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Finance summary (dashboard)
    // ──────────────────────────────────────────────────────────────────────────

    public function getSummary(int $academicYearId): array
    {
        $totals = $this->db->fetchOne(
            "SELECT
               SUM(amount_due)                                     AS total_expected,
               SUM(amount_paid)                                    AS total_collected,
               SUM(CASE WHEN status = 'paid'    THEN 1 ELSE 0 END) AS paid_count,
               SUM(CASE WHEN status = 'unpaid'  THEN 1 ELSE 0 END) AS unpaid_count,
               SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdue_count,
               SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) AS partial_count
             FROM `fee_invoices`
             WHERE academic_year_id = ? AND fee_type != 'BURSARY_CREDIT'",
            [$academicYearId]
        );

        $recentPayments = $this->db->fetchAll(
            "SELECT fp.receipt_number, fp.amount, fp.payment_method, fp.paid_at,
                    s.fname, s.lname, fi.fee_type
             FROM `fee_payments` fp
             JOIN  `fee_invoices` fi ON fi.id = fp.invoice_id
             LEFT JOIN `student` s ON s.regnumber = fp.student_id
             WHERE fi.academic_year_id = ? AND fp.status = 'confirmed'
             ORDER BY fp.paid_at DESC
             LIMIT 10",
            [$academicYearId]
        );

        $overdueCount = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `fee_invoices`
             WHERE academic_year_id = ? AND due_date < CURDATE()
               AND status IN ('unpaid','partial') AND fee_type != 'BURSARY_CREDIT'",
            [$academicYearId]
        )['cnt'] ?? 0);

        return [
            'totals'          => $totals,
            'recent_payments' => $recentPayments,
            'overdue_count'   => $overdueCount,
        ];
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────────────────────────────────

    private function createStructuredInvoice(
        string $studentId,
        int    $academicYearId,
        ?int   $semester,
        string $feeType,
        ?int   $departmentId,
        ?int   $levelId,
        int    $actorId
    ): array {
        if ($this->invoiceModel->studentHasInvoice($studentId, $academicYearId, $feeType)) {
            return ['created' => false, 'id' => null];
        }

        $structure = $this->structureModel->findBestMatch(
            $academicYearId, $feeType, $departmentId, $levelId, $semester
        );

        if (!$structure) {
            return ['created' => false, 'id' => null];
        }

        $label = match ($feeType) {
            'TUITION'      => 'Tuition fee',
            'REGISTRATION' => 'Registration fee',
            'ADMISSION'    => 'Admission fee',
            default        => $structure['label'],
        };
        if ($semester) {
            $label .= " (Semester {$semester})";
        }

        $invoiceId = $this->invoiceModel->create([
            'invoice_number'      => $this->generateInvoiceNumber(),
            'student_id'          => $studentId,
            'fee_structure_id'    => (int)$structure['id'],
            'academic_year_id'    => $academicYearId,
            'semester'            => $semester,
            'fee_type'            => $feeType,
            'description'         => $label,
            'amount_due'          => (float)$structure['amount'],
            'is_system_generated' => 1,
            'created_by'          => $actorId,
        ]);

        return ['created' => true, 'id' => (int)$invoiceId];
    }

    private function isFirstYearStudent(array $student, int $academicYearId): bool
    {
        // Student is "new" if their registration_date falls within this academic year
        $year = $this->db->fetchOne(
            "SELECT start_date, end_date FROM `academic_years` WHERE id = ? LIMIT 1",
            [$academicYearId]
        );
        if (!$year) {
            return false;
        }
        $regDate = $student['registration_date'] ?? $student['accepted_date'] ?? null;
        if (!$regDate) {
            return false;
        }
        return $regDate >= $year['start_date'] && $regDate <= $year['end_date'];
    }

    /** Return modules that a student failed or is repeating in the given year. */
    private function getRepeatModules(string $studentId, int $academicYearId): array
    {
        return $this->db->fetchAll(
            "SELECT mr.module_id, mr.status, m.module_name, m.module_code
             FROM `module_registrations` mr
             JOIN `modules` m ON m.module_id = mr.module_id
             JOIN `academic_terms` t ON t.id = mr.academic_term_id
             WHERE mr.student_regnumber = ?
               AND t.academic_year_id = ?
               AND mr.status IN ('failed', 'repeat')",
            [$studentId, $academicYearId]
        );
    }

    /** Sum of unpaid/partial balances from prior years. */
    private function calculateArrears(string $studentId, int $currentYearId): float
    {
        $row = $this->db->fetchOne(
            "SELECT SUM(amount_due - amount_paid - bursary_applied) AS arrears
             FROM `fee_invoices`
             WHERE student_id = ?
               AND academic_year_id < ?
               AND status IN ('unpaid', 'partial', 'overdue')
               AND fee_type != 'BURSARY_CREDIT'",
            [$studentId, $currentYearId]
        );
        return max(0, (float)($row['arrears'] ?? 0));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Sequential number generators (year-scoped, padded to 6 digits)
    // ──────────────────────────────────────────────────────────────────────────

    public function generateInvoiceNumber(): string
    {
        $year = date('Y');
        $row  = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `fee_invoices` WHERE invoice_number LIKE ?",
            ["INV-{$year}-%"]
        );
        $seq = str_pad((string)(((int)($row['cnt'] ?? 0)) + 1), 6, '0', STR_PAD_LEFT);
        return "INV-{$year}-{$seq}";
    }

    public function generateReceiptNumber(): string
    {
        $year = date('Y');
        $row  = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `fee_payments` WHERE receipt_number LIKE ?",
            ["RCP-{$year}-%"]
        );
        $seq = str_pad((string)(((int)($row['cnt'] ?? 0)) + 1), 6, '0', STR_PAD_LEFT);
        return "RCP-{$year}-{$seq}";
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Account Balance
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Compute net account balance for a year:
     *   net = total_collected − total_expenses
     */
    public function getAccountBalance(int $yearId): array
    {
        // Income side
        $income = $this->db->fetchOne(
            "SELECT
               COALESCE(SUM(fi.amount_due),  0) AS total_expected,
               COALESCE(SUM(fi.amount_paid), 0) AS total_collected,
               COALESCE(SUM(fi.bursary_applied), 0) AS total_bursary
             FROM `fee_invoices` fi
             WHERE fi.academic_year_id = ? AND fi.fee_type != 'BURSARY_CREDIT'",
            [$yearId]
        );

        // Expense side (new table — graceful if table not yet created)
        try {
            $expRow = $this->db->fetchOne(
                "SELECT COALESCE(SUM(amount), 0) AS total_expenses
                 FROM `expenses` WHERE academic_year_id = ?",
                [$yearId]
            );
            $totalExpenses = (float)($expRow['total_expenses'] ?? 0);
        } catch (\Throwable) {
            $totalExpenses = 0.0;
        }

        // Expense breakdown by category
        try {
            $expenseByCategory = $this->db->fetchAll(
                "SELECT ec.name AS category_name,
                        COALESCE(SUM(e.amount), 0) AS total
                 FROM `expense_categories` ec
                 LEFT JOIN `expenses` e ON e.category_id = ec.id
                                       AND e.academic_year_id = ?
                 GROUP BY ec.id, ec.name
                 HAVING total > 0
                 ORDER BY total DESC",
                [$yearId]
            );
        } catch (\Throwable) {
            $expenseByCategory = [];
        }

        $totalCollected = (float)($income['total_collected'] ?? 0);
        $totalExpected  = (float)($income['total_expected']  ?? 0);
        $netBalance     = $totalCollected - $totalExpenses;

        $budgets      = $this->budgetModel->getBudgetsForYear($yearId);
        $totalBudget  = array_sum(array_column($budgets, 'amount'));

        return [
            'expected_revenue'    => $totalExpected,
            'collected_revenue'   => $totalCollected,
            'bursary_revenue'     => (float)($income['total_bursary'] ?? 0),
            'total_expenses'      => $totalExpenses,
            'net_balance'         => $netBalance,
            'total_budget'        => $totalBudget,
            'budgets'             => $budgets,
            'collection_rate'     => $totalExpected > 0
                                       ? round(($totalCollected / $totalExpected) * 100, 1)
                                       : 0,
            'expense_by_category' => $expenseByCategory,
        ];
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Expected Income Projection (from fee structures, before invoices generated)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Project expected income from fee structures for a year.
     * Groups by fee type with configured amount and enrolled student counts.
     */
    public function getIncomeProjection(int $yearId): array
    {
        $structures = $this->db->fetchAll(
            "SELECT fs.fee_type, fs.label,
                    fs.amount,
                    fs.department_id,
                    dep.dep_name AS department_name,
                    fs.level_id,
                    l.name AS level_name,
                    fs.semester
             FROM `fee_structures` fs
             LEFT JOIN `departements` dep ON dep.dep_id = fs.department_id
             LEFT JOIN `levels` l         ON l.id       = fs.level_id
             WHERE fs.academic_year_id = ? AND fs.is_active = 1
             ORDER BY fs.fee_type, fs.amount DESC",
            [$yearId]
        );

        // Count enrolled students matching each structure
        $enrolled = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `student` WHERE student_state = 'active'"
        )['cnt'] ?? 0);

        return [
            'structures'       => $structures,
            'enrolled_students' => $enrolled,
        ];
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Email notification (graceful — never blocks a transaction)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Send a payment confirmation email with a PDF receipt attachment.
     * Uses PHPMailer and Dompdf.
     */
    public function sendPaymentConfirmationEmail(int $paymentId): void
    {
        try {
            $receipt = $this->paymentModel->getReceiptData($paymentId);
            if (!$receipt) return;

            $student = $this->db->fetchOne(
                "SELECT email, fname, lname FROM `student` WHERE regnumber = ? LIMIT 1",
                [$receipt['student_id'] ?? '']
            );
            if (empty($student['email'])) return;

            $to     = $student['email'];
            $name   = trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? ''));
            $amount = number_format((float)$receipt['amount'], 0) . ' RWF';
            $rNo    = $receipt['receipt_number'] ?? '';

            // 1. Generate PDF
            $options = new Options();
            $options->set('isHtml5ParserEnabled', true);
            $dompdf = new Dompdf($options);

            $html = "
            <div style='font-family: sans-serif; padding: 20px; border: 1px solid #eee;'>
                <h1 style='color: #004a99;'>Payment Receipt</h1>
                <p><strong>Receipt Number:</strong> {$rNo}</p>
                <p><strong>Student:</strong> {$name} ({$receipt['student_id']})</p>
                <p><strong>Amount Paid:</strong> {$amount}</p>
                <p><strong>Date:</strong> " . date('d F Y', strtotime($receipt['paid_at'])) . "</p>
                <p><strong>Payment Method:</strong> {$receipt['payment_method']}</p>
                <hr/>
                <p style='font-size: 12px; color: #666;'>Catholic University of Rwanda — Finance Office</p>
            </div>";

            $dompdf->loadHtml($html);
            $dompdf->setPaper('A4', 'portrait');
            $dompdf->render();
            $pdfContent = $dompdf->output();

            // 2. Send Email
            $mail = new PHPMailer(true);
            
            // SMTP Settings (assuming standard naming in .env)
            $mail->isSMTP();
            $mail->Host       = $_ENV['MAIL_HOST'] ?? 'localhost';
            $mail->SMTPAuth   = !empty($_ENV['MAIL_PASS']);
            $mail->Username   = $_ENV['MAIL_USER'] ?? '';
            $mail->Password   = $_ENV['MAIL_PASS'] ?? '';
            $mail->SMTPSecure = $_ENV['MAIL_ENCRYPTION'] ?? PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Port       = (int)($_ENV['MAIL_PORT'] ?? 587);

            $mail->setFrom($_ENV['MAIL_FROM_ADDRESS'] ?? 'noreply@cur.ac.rw', $_ENV['MAIL_FROM_NAME'] ?? 'CUR Finance');
            $mail->addAddress($to, $name);
            $mail->Subject = "Payment Receipt — {$rNo} | CUR";
            $mail->Body    = "Dear {$name},\n\nPlease find attached your payment receipt for the amount of {$amount}.\n\nThank you.\nCUR Finance Office";
            
            $mail->addStringAttachment($pdfContent, "Receipt_{$rNo}.pdf");
            $mail->send();

        } catch (\Throwable $e) {
            // Log error if logger exists, otherwise fail silently as per requirement
            error_log("Failed to send receipt email: " . $e->getMessage());
        }
    }
}
