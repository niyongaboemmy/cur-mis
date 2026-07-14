<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;
use App\Models\FeeStructureModel;
use App\Models\FeeInvoiceModel;
use App\Models\FeePaymentModel;
use App\Models\FeeBursaryModel;
use App\Models\StudentFeeOverrideModel;
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
    private FeeStructureModel       $structureModel;
    private FeeInvoiceModel         $invoiceModel;
    private FeePaymentModel         $paymentModel;
    private FeeBursaryModel         $bursaryModel;
    private StudentFeeOverrideModel $overrideModel;
    private StudentModel            $studentModel;
    private ExpenseModel            $expenseModel;
    private ExpenseBudgetModel      $budgetModel;
    private Database                $db;

    public function __construct()
    {
        $this->structureModel = new FeeStructureModel();
        $this->invoiceModel   = new FeeInvoiceModel();
        $this->paymentModel   = new FeePaymentModel();
        $this->bursaryModel   = new FeeBursaryModel();
        $this->overrideModel  = new StudentFeeOverrideModel();
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
        $updated      = 0;
        $skipped      = 0;
        $invoiceIds   = [];

        // STEP 1 — Tuition
        $result = $this->createStructuredInvoice(
            $studentId, $academicYearId, $semester, 'TUITION',
            $departmentId, $levelId, $actorId
        );
        $created += (int)$result['created'];
        $updated += (int)$result['updated'];
        if (!(int)$result['created'] && !(int)$result['updated'] && !$result['id']) $skipped++;
        if ($result['id']) $invoiceIds[] = $result['id'];

        // STEP 2 — Registration fee (first-time students only)
        if ($this->isFirstYearStudent($student, $academicYearId)) {
            $result = $this->createStructuredInvoice(
                $studentId, $academicYearId, null, 'REGISTRATION',
                $departmentId, $levelId, $actorId
            );
            $created += (int)$result['created'];
            $updated += (int)$result['updated'];
            if (!(int)$result['created'] && !(int)$result['updated'] && !$result['id']) $skipped++;
            if ($result['id']) $invoiceIds[] = $result['id'];
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

        // STEP 6 — Module-linked fees (modules with fee_structure_id set)
        $moduleRegs = $this->getActiveModuleRegistrationsWithFeeStructure($studentId, $academicYearId);
        foreach ($moduleRegs as $reg) {
            if ($this->invoiceModel->studentHasInvoice(
                $studentId, $academicYearId, 'MODULE_FEE', (int)$reg['module_id']
            )) {
                $skipped++;
                continue;
            }
            $feeStructure = $this->structureModel->find((int)$reg['fee_structure_id']);
            if (!$feeStructure) {
                $skipped++;
                continue;
            }
            $invoiceId = $this->invoiceModel->create([
                'invoice_number'      => $this->generateInvoiceNumber(),
                'student_id'          => $studentId,
                'fee_structure_id'    => (int)$reg['fee_structure_id'],
                'academic_year_id'    => $academicYearId,
                'semester'            => $semester,
                'fee_type'            => 'MODULE_FEE',
                'description'         => 'Module fee: ' . $reg['module_name'],
                'amount_due'          => (float)$feeStructure['amount'],
                'is_system_generated' => 1,
                'module_id'           => (int)$reg['module_id'],
                'created_by'          => $actorId,
            ]);
            $created++;
            $invoiceIds[] = (int)$invoiceId;
        }

        return ['created' => $created, 'updated' => $updated, 'skipped' => $skipped, 'invoices' => $invoiceIds];
    }

    /**
     * Bulk generate invoices for a list of students.
     */
    public function bulkGenerateInvoices(array $studentIds, int $academicYearId, ?int $semester, int $actorId): array
    {
        $totalCreated = 0;
        $totalUpdated = 0;
        $totalSkipped = 0;
        $processed    = 0;

        foreach ($studentIds as $id) {
            try {
                $res = $this->autoGenerateInvoices($id, $academicYearId, $semester, $actorId);
                $totalCreated += $res['created'];
                $totalUpdated += $res['updated'] ?? 0;
                $totalSkipped += $res['skipped'];
                $processed++;
            } catch (\Throwable $e) {
                error_log("Bulk Invoice Error [{$id}]: " . $e->getMessage());
            }
        }

        return [
            'processed_students' => $processed,
            'total_created'      => $totalCreated,
            'total_updated'      => $totalUpdated,
            'total_skipped'      => $totalSkipped,
        ];
    }

    /**
     * Bulk generate invoices for all students matching the given filters.
     */
    public function bulkGenerateByFilters(array $filters, int $actorId): array
    {
        set_time_limit(0);
        ini_set('memory_limit', '256M');

        $yearId   = (int)($filters['academic_year_id'] ?? 0);
        $semester = !empty($filters['semester']) ? (int)$filters['semester'] : null;
        $faculty  = !empty($filters['faculty_id']) ? (int)$filters['faculty_id'] : null;
        $dept     = !empty($filters['department_id']) ? (int)$filters['department_id'] : null;

        if (!$yearId) {
            throw new \InvalidArgumentException("Academic Year is required for bulk generation.");
        }

        $where = ["s.student_state = 'active'"];

        $bindings = [];

        if ($faculty) {
            $where[] = "(s.faculty COLLATE utf8mb4_unicode_ci = CAST(? AS CHAR) COLLATE utf8mb4_unicode_ci OR s.faculty = (SELECT fac_name FROM `faculty` WHERE fac_id = ?))";
            $bindings[] = $faculty;
            $bindings[] = $faculty;
        }
        if ($dept) {
            $where[] = "(s.department COLLATE utf8mb4_unicode_ci = CAST(? AS CHAR) COLLATE utf8mb4_unicode_ci OR s.department = (SELECT dep_acronym FROM `departements` WHERE dep_id = ?))";
            $bindings[] = $dept;
            $bindings[] = $dept;
        }

        $whereSql = implode(" AND ", $where);
        $students = $this->db->fetchAll("SELECT s.regnumber FROM `student` s WHERE {$whereSql}", $bindings);

        $studentIds = array_column($students, 'regnumber');

        return $this->bulkGenerateInvoices($studentIds, $yearId, $semester, $actorId);
    }

    /**
     * Get a comprehensive ledger for a student in a specific academic year.
     */
    public function getStudentLedger(string $studentId, int $yearId): array
    {
        $student = $this->db->fetchOne(
            "SELECT s.regnumber AS student_id, s.fname, s.lname, s.gender, s.current_level AS level,
                    f.fac_name AS faculty_name, d.dep_name AS department_name, p.program_name
             FROM `student` s
             LEFT JOIN `faculty` f ON f.fac_id = COALESCE(NULLIF(CAST(s.faculty AS UNSIGNED), 0), (SELECT fac_id FROM `faculty` WHERE fac_name = s.faculty LIMIT 1))
             LEFT JOIN `departements` d ON d.dep_id = COALESCE(NULLIF(CAST(s.department AS UNSIGNED), 0), (SELECT dep_id FROM `departements` WHERE dep_acronym = s.department LIMIT 1))
             LEFT JOIN `programs` p ON p.program_id = s.program
             WHERE s.regnumber = ?
             LIMIT 1",
            [$studentId]
        );

        return [
            'student'   => $student,
            'invoices'  => $this->invoiceModel->listWithDetails(['student_id' => $studentId, 'academic_year_id' => $yearId]),
            'payments'  => $this->paymentModel->listWithDetails(['student_id' => $studentId])['data'] ?? [],
            'totals'    => $this->invoiceModel->getStudentLedgerTotals($studentId, $yearId)
        ];
    }

    /**
     * Get financial summary for a group of students.
     */
    public function getGroupBillingSummary(array $filters): array
    {
        $yearId        = (int)($filters['academic_year_id'] ?? 0);
        $semester      = !empty($filters['semester']) ? (int)$filters['semester'] : null;
        $faculty       = !empty($filters['faculty_id']) ? (int)$filters['faculty_id'] : null;
        $dept          = !empty($filters['department_id']) ? (int)$filters['department_id'] : null;
        $keyword       = !empty($filters['keyword']) ? trim($filters['keyword']) : null;
        $balanceFilter = !empty($filters['balance_filter']) ? $filters['balance_filter'] : null; // collected|bursary|pending
        $page          = (int)($filters['page'] ?? 1);
        $perPage       = (int)($filters['per_page'] ?? 50);

        if (!$yearId) {
            throw new \InvalidArgumentException("Academic Year is required for billing summary.");
        }

        $where = ["s.student_state = 'active'"];
        $bindings = [$yearId]; // For the left join subquery

        if ($semester) {
            $semSql = "AND (semester = ? OR semester IS NULL)";
            $bindings[] = $semester;
        } else {
            $semSql = "";
        }

        if ($faculty) {
            $where[] = "(s.faculty COLLATE utf8mb4_unicode_ci = CAST(? AS CHAR) COLLATE utf8mb4_unicode_ci OR s.faculty = (SELECT fac_name FROM `faculty` WHERE fac_id = ?))";
            $bindings[] = $faculty;
            $bindings[] = $faculty;
        }
        if ($dept) {
            // Check both ID and Acronym for robustness
            $where[] = "(s.department COLLATE utf8mb4_unicode_ci = CAST(? AS CHAR) COLLATE utf8mb4_unicode_ci OR s.department = (SELECT dep_acronym FROM `departements` WHERE dep_id = ?))";
            $bindings[] = $dept;
            $bindings[] = $dept;
        }
        if ($keyword) {
            $where[] = "(s.regnumber LIKE ? OR s.fname LIKE ? OR s.lname LIKE ?)";
            $k = "%{$keyword}%";
            $bindings[] = $k;
            $bindings[] = $k;
            $bindings[] = $k;
        }

        // Base WHERE (no balance filter) — used for KPI aggregates so they stay stable
        $whereBase = $where;
        $whereSqlBase = implode(" AND ", $whereBase);

        // Balance filter — references `sums.*`, so count/data queries must have the sums JOIN
        $balanceCondition = match ($balanceFilter) {
            'collected' => "COALESCE(sums.total_paid, 0) > 0",
            'bursary'   => "COALESCE(sums.total_bursary, 0) > 0",
            'pending'   => "COALESCE(sums.total_paid, 0) = 0 AND (COALESCE(sums.total_due, 0) - COALESCE(sums.total_bursary, 0)) > 0",
            'partial'   => "COALESCE(sums.total_paid, 0) > 0 AND (COALESCE(sums.total_due, 0) - COALESCE(sums.total_paid, 0) - COALESCE(sums.total_bursary, 0)) > 0",
            'overdue'   => "COALESCE(sums.total_paid, 0) < COALESCE(sums.total_due, 0) AND sums.min_due_date < CURDATE()",
            default     => null,
        };
        if ($balanceCondition) {
            $where[] = $balanceCondition;
        }

        $whereSql = implode(" AND ", $where);

        // Build the sums subquery fragment (reused in count query when balance filter is active)
        $sumsJoin = "LEFT JOIN (
                    SELECT student_id,
                        SUM(amount_due) AS total_due,
                        SUM(amount_paid) AS total_paid,
                        SUM(bursary_applied) AS total_bursary,
                        MIN(due_date) AS min_due_date
                    FROM `fee_invoices`
                    WHERE academic_year_id = ? AND fee_type != 'BURSARY_CREDIT' {$semSql}
                    GROUP BY student_id
                ) AS sums ON sums.student_id = s.regnumber";

        // Bindings for the sums subquery in the count query (yearId + optional semester)
        $sumsBindings = array_merge([$yearId], ($semester ? [$semester] : []));

        // Re-organised where-only bindings (no join bindings)
        $whereBindings = [];
        if ($faculty) { $whereBindings[] = $faculty; $whereBindings[] = $faculty; }
        if ($dept)    { $whereBindings[] = $dept;    $whereBindings[] = $dept; }
        if ($keyword) { $k = "%{$keyword}%"; $whereBindings[] = $k; $whereBindings[] = $k; $whereBindings[] = $k; }

        // 1. Get total count for pagination
        if ($balanceCondition) {
            // Need sums JOIN in count query so the balance condition can reference sums.*
            $totalSql = "SELECT COUNT(*) AS cnt FROM `student` s {$sumsJoin} WHERE {$whereSql}";
            $totalBindings = array_merge($sumsBindings, $whereBindings);
        } else {
            $totalSql = "SELECT COUNT(*) AS cnt FROM `student` s WHERE {$whereSql}";
            $totalBindings = $whereBindings;
        }

        $totalRow = $this->db->fetchOne($totalSql, $totalBindings);
        $total = (int)($totalRow['cnt'] ?? 0);

        // 2. Get paginated data
        $offset = ($page - 1) * $perPage;
        
        // Main bindings (with structure_tuition subquery)
        $mainBindings = array_merge(
            [$yearId, $semester], 
            [$yearId], 
            ($semester ? [$semester] : []), 
            $whereBindings
        );

        // Totals bindings (without structure_tuition)
        $totalsBindings = array_merge(
            [$yearId], 
            ($semester ? [$semester] : []), 
            $whereBindings
        );


        $sql = "SELECT 
                    s.regnumber,
                    s.fname,
                    s.lname,
                    f.fac_name AS faculty,
                    d.dep_name AS department,
                    COALESCE(sums.total_due, 0) AS total_expected,
                    COALESCE(sums.total_paid, 0) AS total_collected,
                    COALESCE(sums.total_bursary, 0) AS total_bursary,
                    (COALESCE(sums.total_due, 0) - COALESCE(sums.total_paid, 0) - COALESCE(sums.total_bursary, 0)) AS balance,
                    (SELECT amount FROM `fee_structures` fs
                     WHERE fs.academic_year_id = ?
                       AND fs.fee_type = 'TUITION'
                       AND (fs.department_id = COALESCE(
                               NULLIF(CAST(s.department AS UNSIGNED), 0),
                               (SELECT dep_id FROM `departements` WHERE dep_acronym = s.department LIMIT 1)
                           ) OR fs.department_id IS NULL)
                       AND (fs.semester = ? OR fs.semester IS NULL)
                     ORDER BY
                        CASE WHEN fs.department_id IS NOT NULL THEN 0 ELSE 1 END,
                        CASE WHEN fs.semester IS NOT NULL THEN 0 ELSE 1 END
                     LIMIT 1
                    ) AS structure_tuition
                FROM `student` s
                LEFT JOIN `faculty` f ON f.fac_id = COALESCE(
                    NULLIF(CAST(s.faculty AS UNSIGNED), 0),
                    (SELECT fac_id FROM `faculty` WHERE fac_name = s.faculty LIMIT 1)
                )
                LEFT JOIN `departements` d ON d.dep_id = COALESCE(
                    NULLIF(CAST(s.department AS UNSIGNED), 0),
                    (SELECT dep_id FROM `departements` WHERE dep_acronym = s.department LIMIT 1)
                )
                LEFT JOIN (
                    SELECT
                        student_id,
                        SUM(amount_due) AS total_due,
                        SUM(amount_paid) AS total_paid,
                        SUM(bursary_applied) AS total_bursary,
                        MIN(due_date) AS min_due_date
                    FROM `fee_invoices`
                    WHERE academic_year_id = ? AND fee_type != 'BURSARY_CREDIT' {$semSql}
                    GROUP BY student_id
                ) AS sums ON sums.student_id = s.regnumber
                WHERE {$whereSql}
                ORDER BY s.lname ASC, s.fname ASC
                LIMIT {$perPage} OFFSET {$offset}";

        $results = $this->db->fetchAll($sql, $mainBindings);



        // 3. Get global totals (KPI cards) — always uses base WHERE without balance filter
        $totalsSql = "SELECT
                        SUM(COALESCE(sums.total_due, 0)) AS global_expected,
                        SUM(COALESCE(sums.total_paid, 0)) AS global_collected,
                        SUM(COALESCE(sums.total_bursary, 0)) AS global_bursary,
                        SUM(CASE WHEN COALESCE(sums.total_paid, 0) > 0
                                  AND (COALESCE(sums.total_due, 0) - COALESCE(sums.total_paid, 0) - COALESCE(sums.total_bursary, 0)) > 0
                             THEN 1 ELSE 0 END) AS partial_count,
                        SUM(CASE WHEN COALESCE(sums.total_paid, 0) > 0
                                  AND (COALESCE(sums.total_due, 0) - COALESCE(sums.total_paid, 0) - COALESCE(sums.total_bursary, 0)) > 0
                             THEN (COALESCE(sums.total_due, 0) - COALESCE(sums.total_paid, 0) - COALESCE(sums.total_bursary, 0))
                             ELSE 0 END) AS partial_balance
                      FROM `student` s
                      LEFT JOIN (
                          SELECT
                              student_id,
                              SUM(amount_due) AS total_due,
                              SUM(amount_paid) AS total_paid,
                              SUM(bursary_applied) AS total_bursary
                          FROM `fee_invoices`
                          WHERE academic_year_id = ? AND fee_type != 'BURSARY_CREDIT' {$semSql}
                          GROUP BY student_id
                      ) AS sums ON sums.student_id = s.regnumber
                      WHERE {$whereSqlBase}";

        $totalsBindings = array_merge([$yearId], ($semester ? [$semester] : []), $whereBindings);
        $totalsRow = $this->db->fetchOne($totalsSql, $totalsBindings);

        return [
            'data'         => $results,

            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / $perPage),
            'aggregates'   => [
                'expected'        => (float)($totalsRow['global_expected'] ?? 0),
                'collected'       => (float)($totalsRow['global_collected'] ?? 0),
                'bursary'         => (float)($totalsRow['global_bursary'] ?? 0),
                'balance'         => (float)($totalsRow['global_expected'] ?? 0) - (float)($totalsRow['global_collected'] ?? 0) - (float)($totalsRow['global_bursary'] ?? 0),
                'partial_count'   => (int)($totalsRow['partial_count'] ?? 0),
                'partial_balance' => (float)($totalsRow['partial_balance'] ?? 0),
            ]
        ];
    }

    /**
     * Get all active students with their billing status (invoiced or not).
     * Unlike getGroupBillingSummary, this includes students with zero invoices.
     */
    public function getAllStudentsWithStatus(array $filters): array
    {
        $yearId        = (int)($filters['academic_year_id'] ?? 0);
        $semester      = !empty($filters['semester']) ? (int)$filters['semester'] : null;
        $faculty       = !empty($filters['faculty_id']) ? (int)$filters['faculty_id'] : null;
        $dept          = !empty($filters['department_id']) ? (int)$filters['department_id'] : null;
        $keyword       = !empty($filters['keyword']) ? trim($filters['keyword']) : null;
        $page          = (int)($filters['page'] ?? 1);
        $perPage       = (int)($filters['per_page'] ?? 50);

        if (!$yearId) {
            throw new \InvalidArgumentException("Academic Year is required.");
        }

        $where = ["s.student_state = 'active'"];
        $bindings = [$yearId]; // For the left join subquery

        if ($semester) {
            $semSql = "AND (semester = ? OR semester IS NULL)";
            $bindings[] = $semester;
        } else {
            $semSql = "";
        }

        if ($faculty) {
            $where[] = "(s.faculty COLLATE utf8mb4_unicode_ci = CAST(? AS CHAR) COLLATE utf8mb4_unicode_ci OR s.faculty = (SELECT fac_name FROM `faculty` WHERE fac_id = ?))";
            $bindings[] = $faculty;
            $bindings[] = $faculty;
        }
        if ($dept) {
            $where[] = "(s.department COLLATE utf8mb4_unicode_ci = CAST(? AS CHAR) COLLATE utf8mb4_unicode_ci OR s.department = (SELECT dep_acronym FROM `departements` WHERE dep_id = ?))";
            $bindings[] = $dept;
            $bindings[] = $dept;
        }
        if ($keyword) {
            $where[] = "(s.regnumber LIKE ? OR s.fname LIKE ? OR s.lname LIKE ?)";
            $k = "%{$keyword}%";
            $bindings[] = $k;
            $bindings[] = $k;
            $bindings[] = $k;
        }

        $whereSql = implode(" AND ", $where);
        $offset = ($page - 1) * $perPage;

        // Query ALL students with LEFT JOIN to invoices (includes students with no invoices)
        $sumsJoin = "LEFT JOIN (
                    SELECT student_id,
                        SUM(amount_due) AS total_due,
                        SUM(amount_paid) AS total_paid,
                        SUM(bursary_applied) AS total_bursary
                    FROM `fee_invoices`
                    WHERE academic_year_id = ? AND fee_type != 'BURSARY_CREDIT' {$semSql}
                    GROUP BY student_id
                ) AS sums ON sums.student_id = s.regnumber";

        $sumsBindings = array_merge([$yearId], ($semester ? [$semester] : []));

        // Total count
        $totalSql = "SELECT COUNT(*) AS cnt FROM `student` s WHERE {$whereSql}";
        $whereBindings = [];
        if ($faculty) { $whereBindings[] = $faculty; $whereBindings[] = $faculty; }
        if ($dept)    { $whereBindings[] = $dept;    $whereBindings[] = $dept; }
        if ($keyword) { $k = "%{$keyword}%"; $whereBindings[] = $k; $whereBindings[] = $k; $whereBindings[] = $k; }

        $totalRow = $this->db->fetchOne($totalSql, $whereBindings);
        $total = (int)($totalRow['cnt'] ?? 0);

        // Paginated data with billing info
        $dataSql = "SELECT
                    s.regnumber COLLATE utf8mb4_unicode_ci,
                    s.fname COLLATE utf8mb4_unicode_ci,
                    s.lname COLLATE utf8mb4_unicode_ci,
                    s.email COLLATE utf8mb4_unicode_ci,
                    s.student_state,
                    COALESCE(s.faculty COLLATE utf8mb4_unicode_ci, (SELECT fac_name FROM `faculty` WHERE fac_id = CAST(s.faculty AS UNSIGNED) LIMIT 1)) AS faculty,
                    COALESCE(s.department COLLATE utf8mb4_unicode_ci, (SELECT dep_name FROM `departements` WHERE dep_id = CAST(s.department AS UNSIGNED) LIMIT 1)) AS department,
                    COALESCE(sums.total_due, 0) AS total_expected,
                    COALESCE(sums.total_paid, 0) AS total_collected,
                    COALESCE(sums.total_bursary, 0) AS total_bursary,
                    COALESCE(sums.total_due, 0) - COALESCE(sums.total_paid, 0) - COALESCE(sums.total_bursary, 0) AS balance,
                    IF(COALESCE(sums.total_due, 0) > 0, 1, 0) AS has_invoices
                 FROM `student` s
                 {$sumsJoin}
                 WHERE {$whereSql}
                 ORDER BY s.fname COLLATE utf8mb4_unicode_ci ASC
                 LIMIT ? OFFSET ?";

        $dataBindings = array_merge($sumsBindings, $whereBindings, [$perPage, $offset]);
        $results = $this->db->fetchAll($dataSql, $dataBindings);

        return [
            'data'         => $results,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / $perPage),
        ];
    }

    /**
     * Export billing summary as CSV.
     */
    public function exportBillingSummary(array $filters): string
    {
        // Fetch ALL matching students (no pagination)
        $filters['page'] = 1;
        $filters['per_page'] = 5000;
        $result = $this->getGroupBillingSummary($filters);
        $data = $result['data'] ?? [];

        $output = "Reg Number,First Name,Last Name,Faculty,Department,Expected,Collected,Bursary,Balance\n";
        foreach ($data as $row) {
            $output .= "{$row['regnumber']},{$row['fname']},{$row['lname']},{$row['faculty']},{$row['department']},{$row['total_expected']},{$row['total_collected']},{$row['total_bursary']},{$row['balance']}\n";
        }
        return $output;
    }


    // ──────────────────────────────────────────────────────────────────────────
    // Bulk bursary creation (sponsor-driven)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Create confirmed bursary records for a list of student IDs, all from one sponsor.
     * Skips students that already have a confirmed bursary of the same type for the year.
     *
     * @param string[] $studentIds
     * @return array{created:int,skipped:int,total_input:int}
     */
    public function bulkCreateBursaries(
        array   $studentIds,
        int     $academicYearId,
        float   $amountPerStudent,
        string  $bursaryType,
        ?int    $sponsorId,
        int     $actorId
    ): array {
        $created = 0;
        $skipped = 0;

        foreach ($studentIds as $sid) {
            $sid = trim((string)$sid);
            if ($sid === '') {
                continue;
            }

            // Check if any bursary of the same type already exists for this student/year
            $existing = $this->db->fetchOne(
                "SELECT id, sponsor_id, status FROM `fee_bursaries`
                 WHERE student_id = ? AND academic_year_id = ? AND bursary_type = ?
                 LIMIT 1",
                [$sid, $academicYearId, $bursaryType]
            );

            if ($existing) {
                // If it's already assigned to a DIFFERENT real sponsor, skip it
                if ($existing['sponsor_id'] && (int)$existing['sponsor_id'] !== 0 && (int)$existing['sponsor_id'] !== $sponsorId) {
                    $skipped++;
                    continue;
                }

                // If it's unassigned or already assigned to THIS sponsor, we "upgrade" it
                $this->bursaryModel->update((int)$existing['id'], [
                    'sponsor_id'   => $sponsorId,
                    'amount'       => $amountPerStudent,
                    'status'       => 'confirmed',
                    'confirmed_at' => date('Y-m-d H:i:s'),
                    'confirmed_by' => $actorId,
                    'approved_by'  => $actorId,
                ]);

                // Re-distribute immediately
                $this->applyBursaries($sid, $academicYearId, $actorId);
                $created++;
                continue;
            }

            $now = date('Y-m-d H:i:s');
            $this->bursaryModel->create([
                'student_id'       => $sid,
                'academic_year_id' => $academicYearId,
                'bursary_type'     => $bursaryType,
                'amount'           => $amountPerStudent,
                'sponsor_id'       => $sponsorId,
                'approved_by'      => $actorId,
                'status'           => 'confirmed',
                'confirmed_at'     => $now,
                'confirmed_by'     => $actorId,
            ]);

            // Re-distribute bursaries for this student immediately
            $this->applyBursaries($sid, $academicYearId, $actorId);
            $created++;
        }

        return ['created' => $created, 'skipped' => $skipped, 'total_input' => count($studentIds)];
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
                    fp.source, s.fname, s.lname, fi.fee_type
             FROM `fee_payments` fp
             JOIN  `fee_invoices` fi ON fi.id = fp.invoice_id
             LEFT JOIN `student` s ON s.regnumber COLLATE utf8mb4_unicode_ci = fp.student_id COLLATE utf8mb4_unicode_ci
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

        // Application fee transfers credited to invoices this year
        $appTransferStats = $this->db->fetchOne(
            "SELECT COALESCE(SUM(fp.amount), 0) AS total_amount,
                    COUNT(fp.id)                AS total_count
             FROM `fee_payments` fp
             JOIN `fee_invoices` fi ON fi.id = fp.invoice_id
             WHERE fi.academic_year_id = ?
               AND fp.source = 'APPLICATION_TRANSFER'
               AND fp.status = 'confirmed'",
            [$academicYearId]
        );

        return [
            'totals'               => $totals,
            'recent_payments'      => $recentPayments,
            'overdue_count'        => $overdueCount,
            'app_transfer_total'   => (float)($appTransferStats['total_amount'] ?? 0),
            'app_transfer_count'   => (int)($appTransferStats['total_count']    ?? 0),
        ];
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Monthly collections trend
    // ──────────────────────────────────────────────────────────────────────────

    public function getMonthlyCollections(int $academicYearId): array
    {
        $monthly = $this->db->fetchAll(
            "SELECT
                MONTH(fp.paid_at)                AS month_num,
                DATE_FORMAT(fp.paid_at, '%b')    AS month_label,
                SUM(fp.amount)                   AS collected,
                COUNT(DISTINCT fp.id)            AS payment_count,
                SUM(CASE WHEN fi.fee_type = 'TUITION'    THEN fp.amount ELSE 0 END) AS tuition,
                SUM(CASE WHEN fi.fee_type = 'HOSTEL'     THEN fp.amount ELSE 0 END) AS hostel,
                SUM(CASE WHEN fi.fee_type NOT IN('TUITION','HOSTEL') THEN fp.amount ELSE 0 END) AS other_fees
             FROM `fee_payments` fp
             JOIN `fee_invoices` fi ON fi.id = fp.invoice_id
             WHERE fi.academic_year_id = ? AND fp.status IN ('confirmed','approved')
             GROUP BY MONTH(fp.paid_at), DATE_FORMAT(fp.paid_at, '%b')
             ORDER BY MONTH(fp.paid_at) ASC",
            [$academicYearId]
        );

        $monthlyExpenses = $this->db->fetchAll(
            "SELECT MONTH(payment_date) AS month_num, SUM(amount) AS expenses
             FROM `expenses` WHERE academic_year_id = ?
             GROUP BY MONTH(payment_date)",
            [$academicYearId]
        );
        $expenseMap = [];
        foreach ($monthlyExpenses as $e) {
            $expenseMap[(int)$e['month_num']] = (float)$e['expenses'];
        }

        $result = [];
        foreach ($monthly as $m) {
            $mn = (int)$m['month_num'];
            $result[] = [
                'month'      => $m['month_label'],
                'month_num'  => $mn,
                'collected'  => (float)$m['collected'],
                'count'      => (int)$m['payment_count'],
                'tuition'    => (float)$m['tuition'],
                'hostel'     => (float)$m['hostel'],
                'other_fees' => (float)$m['other_fees'],
                'expenses'   => $expenseMap[$mn] ?? 0,
            ];
        }
        return $result;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Upsert all invoices for one fee type, respecting the structure's payment_plan.
     *
     * - full_year       → 1 invoice for the total amount
     * - per_semester    → 2 invoices (S1 + S2) when $semester is null,
     *                      or 1 invoice for the requested semester
     * - per_installment → N invoices (one per installment); existing rows are
     *                      updated, missing rows are created
     *
     * Upsert rules applied to every invoice:
     *   - status = paid | waived  → skip entirely (never touch)
     *   - amount_paid > 0         → sync description + fee_structure_id only
     *   - amount_paid = 0         → sync everything (amount_due, description, fee_structure_id)
     *
     * Returns aggregated created/updated counts and the first affected invoice id.
     */
    private function createStructuredInvoice(
        string $studentId,
        int    $academicYearId,
        ?int   $semester,
        string $feeType,
        ?int   $departmentId,
        ?int   $levelId,
        int    $actorId
    ): array {
        $override  = $this->overrideModel->findOverride($studentId, $academicYearId, $feeType);
        $structure = $this->structureModel->findBestMatch(
            $academicYearId, $feeType, $departmentId, $levelId, null
        );

        if ($override) {
            if ($structure) {
                $structure['amount'] = (float)$override['amount'];
            } else {
                $structure = [
                    'id'               => null,
                    'amount'           => (float)$override['amount'],
                    'label'            => $feeType . ' (Override)',
                    'payment_plan'     => 'full_year',
                    'installment_count'=> null,
                    'semester'         => null,
                ];
            }
        } elseif (!$structure) {
            return ['created' => 0, 'updated' => 0, 'id' => null];
        }

        $plan             = $structure['payment_plan'] ?? 'full_year';
        $totalAmount      = (float)$structure['amount'];
        $installmentCount = max(1, (int)($structure['installment_count'] ?? 1));
        $created = 0;
        $updated = 0;
        $firstId = null;

        if ($plan === 'per_installment') {
            $perAmount    = $totalAmount / $installmentCount;
            $structId     = $structure['id'] ? (int)$structure['id'] : null;
            $existingRows = $structId ? $this->db->fetchAll(
                "SELECT id, amount_due, amount_paid, status
                 FROM `fee_invoices`
                 WHERE student_id = ? AND academic_year_id = ? AND fee_type = ?
                   AND fee_structure_id = ? AND is_system_generated = 1
                 ORDER BY id ASC",
                [$studentId, $academicYearId, $feeType, $structId]
            ) : [];

            // Update existing installment rows
            foreach ($existingRows as $idx => $row) {
                if (!$firstId) $firstId = (int)$row['id'];
                if (in_array($row['status'], ['paid', 'waived'])) {
                    continue; // never touch settled rows
                }
                $installNum = $idx + 1;
                $label      = $this->makeLabel($feeType, $structure)
                            . " (Installment {$installNum}/{$installmentCount})";
                $newAmount  = (float)$row['amount_paid'] > 0.0
                            ? (float)$row['amount_due']   // keep amount when partial payment exists
                            : $perAmount;
                $this->db->query(
                    "UPDATE `fee_invoices`
                     SET amount_due = ?, fee_structure_id = ?, description = ?, updated_at = NOW()
                     WHERE id = ?",
                    [$newAmount, $structId, $label, (int)$row['id']]
                );
                $updated++;
            }

            // Create any missing installments
            $existingCount = count($existingRows);
            for ($i = $existingCount + 1; $i <= $installmentCount; $i++) {
                $label = $this->makeLabel($feeType, $structure)
                       . " (Installment {$i}/{$installmentCount})";
                $id = $this->invoiceModel->create([
                    'invoice_number'      => $this->generateInvoiceNumber(),
                    'student_id'          => $studentId,
                    'fee_structure_id'    => $structId,
                    'academic_year_id'    => $academicYearId,
                    'semester'            => null,
                    'fee_type'            => $feeType,
                    'description'         => $label,
                    'amount_due'          => $perAmount,
                    'is_system_generated' => 1,
                    'created_by'          => $actorId,
                ]);
                $created++;
                if (!$firstId) $firstId = (int)$id;
            }

        } elseif ($plan === 'per_semester') {
            $semestersToGen = $semester ? [$semester] : [1, 2];
            $perAmount      = $totalAmount / 2;

            foreach ($semestersToGen as $sem) {
                $res = $this->upsertSingleStructuredInvoice(
                    $studentId, $academicYearId, $sem,
                    $feeType, $structure, $perAmount, $actorId
                );
                $created += (int)$res['created'];
                $updated += (int)$res['updated'];
                if ($res['id'] && !$firstId) $firstId = $res['id'];
            }

        } else {
            // full_year
            $res = $this->upsertSingleStructuredInvoice(
                $studentId, $academicYearId, $semester,
                $feeType, $structure, $totalAmount, $actorId
            );
            $created += (int)$res['created'];
            $updated += (int)$res['updated'];
            if ($res['id']) $firstId = $res['id'];
        }

        return ['created' => $created, 'updated' => $updated, 'id' => $firstId];
    }

    /**
     * Upsert a single invoice scoped to one semester slot (or null = no semester).
     *
     * Upsert rules:
     *   - paid / waived          → skip, return existing id
     *   - partial payment exists → update description + fee_structure_id only
     *   - unpaid, no payment     → update all fields including amount_due
     *   - not found              → create
     */
    private function upsertSingleStructuredInvoice(
        string $studentId,
        int    $academicYearId,
        ?int   $semester,
        string $feeType,
        array  $structure,
        float  $amount,
        int    $actorId
    ): array {
        $label    = $this->makeLabel($feeType, $structure);
        if ($semester) {
            $label .= " (Semester {$semester})";
        }

        $where    = "student_id = ? AND academic_year_id = ? AND fee_type = ? AND is_system_generated = 1";
        $bindings = [$studentId, $academicYearId, $feeType];

        if ($semester !== null) {
            $where      .= " AND semester = ?";
            $bindings[]  = $semester;
        } else {
            $where .= " AND semester IS NULL";
        }

        if (!empty($structure['id'])) {
            $where      .= " AND fee_structure_id = ?";
            $bindings[]  = (int)$structure['id'];
        }

        $existing = $this->db->fetchOne(
            "SELECT id, amount_due, amount_paid, status FROM `fee_invoices` WHERE {$where} LIMIT 1",
            $bindings
        );

        if ($existing) {
            // Never touch invoices the student has already fully settled or waived
            if (in_array($existing['status'], ['paid', 'waived'])) {
                return ['created' => 0, 'updated' => 0, 'id' => (int)$existing['id']];
            }

            $hasPayment = (float)$existing['amount_paid'] > 0.0;
            // Keep amount_due if a partial payment has already been recorded
            $newAmount  = $hasPayment ? (float)$existing['amount_due'] : $amount;
            $structId   = $structure['id'] ? (int)$structure['id'] : null;

            $this->db->query(
                "UPDATE `fee_invoices`
                 SET amount_due = ?, fee_structure_id = ?, description = ?, updated_at = NOW()
                 WHERE id = ?",
                [$newAmount, $structId, $label, (int)$existing['id']]
            );

            return ['created' => 0, 'updated' => 1, 'id' => (int)$existing['id']];
        }

        $id = $this->invoiceModel->create([
            'invoice_number'      => $this->generateInvoiceNumber(),
            'student_id'          => $studentId,
            'fee_structure_id'    => $structure['id'] ? (int)$structure['id'] : null,
            'academic_year_id'    => $academicYearId,
            'semester'            => $semester,
            'fee_type'            => $feeType,
            'description'         => $label,
            'amount_due'          => $amount,
            'is_system_generated' => 1,
            'created_by'          => $actorId,
        ]);

        return ['created' => 1, 'updated' => 0, 'id' => (int)$id];
    }

    private function makeLabel(string $feeType, array $structure): string
    {
        return match ($feeType) {
            'TUITION'      => 'Tuition fee',
            'REGISTRATION' => 'Registration fee',
            'ADMISSION'    => 'Admission fee',
            default        => $structure['label'] ?? $feeType,
        };
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

    /** Return module registrations where the module has a fee_structure_id set. */
    private function getActiveModuleRegistrationsWithFeeStructure(string $studentId, int $academicYearId): array
    {
        return $this->db->fetchAll(
            "SELECT mr.module_id, m.module_name, m.fee_structure_id
             FROM `module_registrations` mr
             JOIN `modules` m ON m.module_id = mr.module_id
             JOIN `academic_terms` t ON t.id = mr.academic_term_id
             WHERE mr.student_regnumber = ?
               AND t.academic_year_id = ?
               AND mr.status = 'registered'
               AND m.fee_structure_id IS NOT NULL",
            [$studentId, $academicYearId]
        );
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
            "SELECT 
                SUM(CASE WHEN fee_type != 'ARREARS' THEN amount_due ELSE 0 END) - 
                SUM(amount_paid) - 
                SUM(bursary_applied) AS arrears
             FROM `fee_invoices`
             WHERE student_id = ?
               AND academic_year_id < ?
               AND fee_type != 'BURSARY_CREDIT'",
            [$studentId, $currentYearId]
        );
        return max(0, (float)($row['arrears'] ?? 0));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Application Fee → Finance Credit
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Resolve the application fee amount for a given academic year.
     *
     * Priority:
     *  1. fee_structures row for the mapped fee type + academic year (finance admin configures this)
     *  2. settings.application_fee_amount
     *  3. Hard default: 5000 RWF
     *
     * Used by UrubutoPayService to determine what amount to charge applicants.
     */
    public function resolveApplicationFeeAmount(int $academicYearId): float
    {
        // 1. Read the mapped fee structure ID from settings
        $setting     = $this->db->fetchOne(
            "SELECT value FROM `settings` WHERE key_name = 'application_fee_mapped_fee_structure_id' LIMIT 1",
            []
        );
        $structureId = (int)($setting['value'] ?? 0);

        // 2. Look up the fee structure directly by ID
        if ($structureId > 0) {
            try {
                $structure = $this->db->fetchOne(
                    "SELECT amount FROM `fee_structures` WHERE id = ? AND is_active = 1 LIMIT 1",
                    [$structureId]
                );
                if ($structure && (float)$structure['amount'] > 0) {
                    return (float)$structure['amount'];
                }
            } catch (\Throwable $e) {
                // fee_structures unavailable — fall through
            }
        }

        // 3. Fall back to settings amount
        $amtSetting = $this->db->fetchOne(
            "SELECT value FROM `settings` WHERE key_name = 'application_fee_amount' LIMIT 1",
            []
        );
        if ($amtSetting && (float)$amtSetting['value'] > 0) {
            return (float)$amtSetting['value'];
        }

        return 5000.0;
    }

    /**
     * Credit an application fee already paid by an applicant into the finance billing system.
     *
     * Called once inside ApplicationService::initiateEnrollment() immediately after
     * autoGenerateInvoices(). Reads `application_fee_mapped_fee_type` from settings
     * to know which invoice category receives the credit.
     *
     * Idempotent: a second call with the same applicationId is a no-op.
     * Safe when mapped fee type is blank: returns early without error.
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

        // Idempotency guard
        $existing = $this->db->fetchOne(
            "SELECT id FROM `fee_payments`
             WHERE source = 'APPLICATION_TRANSFER' AND source_application_id = ?
             LIMIT 1",
            [$applicationId]
        );
        if ($existing) {
            return ['status' => 'duplicate', 'payment_id' => (int)$existing['id']];
        }

        // Read mapped fee structure ID — if blank/zero, skip (admin disabled mapping)
        $setting     = $this->db->fetchOne(
            "SELECT value FROM `settings` WHERE key_name = 'application_fee_mapped_fee_structure_id' LIMIT 1",
            []
        );
        $structureId = (int)($setting['value'] ?? 0);
        if ($structureId <= 0) {
            return ['status' => 'skipped', 'reason' => 'no_mapping_configured'];
        }

        // Resolve fee_type from the structure record
        $feeStructure = $this->db->fetchOne(
            "SELECT fee_type FROM `fee_structures` WHERE id = ? AND is_active = 1 LIMIT 1",
            [$structureId]
        );
        if (!$feeStructure) {
            return ['status' => 'skipped', 'reason' => 'mapped_structure_not_found'];
        }
        $mappedFeeType = $feeStructure['fee_type'];

        // Find the invoice for the mapped fee type for this student + year
        $invoice = $this->db->fetchOne(
            "SELECT id, fee_type, amount_due FROM `fee_invoices`
             WHERE student_id COLLATE utf8mb4_unicode_ci = ?
               AND academic_year_id = ?
               AND fee_type = ?
             ORDER BY id ASC LIMIT 1",
            [$studentId, $academicYearId, $mappedFeeType]
        );

        if (!$invoice) {
            // Create a zero-due placeholder invoice to hold the credit
            // (happens when no matching fee_structure exists for this student's dept/level)
            $invoiceId = (int)$this->invoiceModel->create([
                'invoice_number'      => $this->generateInvoiceNumber(),
                'student_id'          => $studentId,
                'academic_year_id'    => $academicYearId,
                'fee_type'            => $mappedFeeType,
                'description'         => "Application fee transfer — no matching fee structure found",
                'amount_due'          => 0.00,
                'amount_paid'         => 0.00,
                'is_system_generated' => 1,
                'created_by'          => $actorId,
            ]);
        } else {
            $invoiceId = (int)$invoice['id'];
        }

        // Cap credit at invoice amount_due so we never over-credit
        $invoiceDue    = $invoice ? (float)$invoice['amount_due'] : 0.0;
        $creditAmount  = ($invoiceDue > 0 && $amount > $invoiceDue) ? $invoiceDue : $amount;

        $receiptNumber = $this->generateReceiptNumber();

        $paymentId = (int)$this->paymentModel->create([
            'invoice_id'           => $invoiceId,
            'student_id'           => $studentId,
            'amount'               => $creditAmount,
            'payment_method'       => 'MOBILE_MONEY',
            'source'               => 'APPLICATION_TRANSFER',
            'source_application_id'=> $applicationId,
            'reference_number'     => $transactionRef,
            'receipt_number'       => $receiptNumber,
            'status'               => 'confirmed',
            'paid_at'              => date('Y-m-d H:i:s'),
            'recorded_by'          => $actorId,
            'notes'                => "Transferred from application fee. Original tx: {$transactionRef}",
        ]);

        $this->invoiceModel->applyPayment($invoiceId, $creditAmount);

        SystemLogService::log(
            'CREATE',
            'FINANCE',
            "Application fee RWF {$creditAmount} credited to {$mappedFeeType} invoice #{$invoiceId} "
            . "for student {$studentId} (app ID: {$applicationId}, tx: {$transactionRef}).",
            $paymentId,
            'fee_payment',
            ['mapped_fee_type' => $mappedFeeType, 'invoice_id' => $invoiceId, 'amount' => $creditAmount]
        );

        return [
            'status'          => 'credited',
            'payment_id'      => $paymentId,
            'invoice_id'      => $invoiceId,
            'mapped_fee_type' => $mappedFeeType,
            'amount'          => $creditAmount,
        ];
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
                "SELECT ec.id AS category_id,
                        ec.name AS category_name,
                        COALESCE(SUM(e.amount), 0) AS total
                 FROM `expense_categories` ec
                 LEFT JOIN `expenses` e ON e.category_id = ec.id
                                       AND e.academic_year_id = ?
                 GROUP BY ec.id, ec.name
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
