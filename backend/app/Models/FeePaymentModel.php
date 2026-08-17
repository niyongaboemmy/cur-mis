<?php

declare(strict_types=1);

namespace App\Models;

class FeePaymentModel extends BaseModel
{
    protected string $table = 'fee_payments';
    protected array $fillable = [
        'invoice_id', 'student_id', 'amount', 'fee_type', 'academic_year_id', 'semester',
        'payment_method', 'payment_sub_method', 'source', 'source_application_id',
        'reference_number', 'urubuto_service_code', 'fee_structure_id', 'bank_slip_file_id',
        'receipt_number', 'status', 'notes', 'recorded_by', 'paid_at',
        'confirmed_by', 'confirmed_at', 'rejection_reason',
    ];

    /** @param array{student_id?:string,invoice_id?:int,payment_method?:string,status?:string,from_date?:string,to_date?:string} $filters */
    /** @var bool|null Memoised: does this database have the UrubutoPay service catalogue (migration 134)? */
    private static ?bool $serviceCatalogueReady = null;

    /**
     * True when `fee_payments.urubuto_service_code` and the `urubuto_services`
     * catalogue both exist. Checked once per request; false makes every caller
     * behave exactly as it did before migration 134.
     */
    private function hasServiceCatalogue(): bool
    {
        if (self::$serviceCatalogueReady !== null) {
            return self::$serviceCatalogueReady;
        }

        try {
            $col = $this->db->fetchOne(
                "SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'fee_payments'
                    AND COLUMN_NAME = 'urubuto_service_code'",
                []
            );
            $tbl = $this->db->fetchOne(
                "SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'urubuto_services'",
                []
            );
            return self::$serviceCatalogueReady = ((int)($col['c'] ?? 0) > 0 && (int)($tbl['c'] ?? 0) > 0);
        } catch (\Throwable $e) {
            return self::$serviceCatalogueReady = false;
        }
    }

    public function listWithDetails(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['student_id'])) {
            $where[]    = 'fp.student_id COLLATE utf8mb4_unicode_ci = ?';
            $bindings[] = $filters['student_id'];
        }
        if (!empty($filters['invoice_id'])) {
            $where[]    = 'fp.invoice_id = ?';
            $bindings[] = (int)$filters['invoice_id'];
        }
        if (!empty($filters['payment_method'])) {
            $where[]    = 'fp.payment_method = ?';
            $bindings[] = $filters['payment_method'];
        }
        if (!empty($filters['status'])) {
            $where[]    = 'fp.status = ?';
            $bindings[] = $filters['status'];
        }
        if (!empty($filters['from_date'])) {
            $where[]    = 'DATE(fp.paid_at) >= ?';
            $bindings[] = $filters['from_date'];
        }
        if (!empty($filters['to_date'])) {
            $where[]    = 'DATE(fp.paid_at) <= ?';
            $bindings[] = $filters['to_date'];
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
        $offset   = ($page - 1) * $perPage;

        $total = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `fee_payments` fp {$whereSql}",
            $bindings
        )['cnt'] ?? 0);

        // Name the paid-for gateway service alongside the billing fee type, so a
        // listing can say "Fines" rather than only "REGISTRATION". Guarded:
        // migration 134 introduces the column and the catalogue, and this query
        // must not 500 on an environment that has not run it yet.
        $svcSelect = $this->hasServiceCatalogue()
            ? "COALESCE(us.`service_name`, alias.`service_name`) AS urubuto_service_name,"
            : "NULL AS urubuto_service_name,";
        $svcJoin = $this->hasServiceCatalogue()
            ? "LEFT JOIN `urubuto_services` us    ON us.`service_code` = fp.`urubuto_service_code`
             LEFT JOIN `urubuto_services` alias ON alias.`service_code` = us.`alias_of`"
            : '';

        $rows = $this->db->fetchAll(
            "SELECT fp.*,
                    fi.invoice_number, fi.fee_type, fi.description AS invoice_description,
                    fi.academic_year_id,
                    {$svcSelect}
                    COALESCE(ft.`label`, fi.`fee_type`) AS fee_type_label,
                    s.fname AS student_fname, s.lname AS student_lname,
                    u.full_name  AS recorded_by_name
             FROM `fee_payments` fp
             LEFT JOIN `fee_invoices` fi ON fi.id = fp.invoice_id
             LEFT JOIN `fee_types` ft    ON ft.`code` = fi.`fee_type`
             LEFT JOIN `student` s       ON s.regnumber COLLATE utf8mb4_unicode_ci = fp.student_id COLLATE utf8mb4_unicode_ci
             LEFT JOIN `users` u         ON u.id = fp.recorded_by
             {$svcJoin}
             {$whereSql}
             ORDER BY fp.paid_at DESC
             LIMIT {$perPage} OFFSET {$offset}",
            $bindings
        );

        return [
            'data'         => $rows,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / $perPage),
        ];
    }

    /** Full receipt data for PDF generation. */
    public function getReceiptData(int $paymentId): array|false
    {
        return $this->db->fetchOne(
            "SELECT fp.*,
                    fi.invoice_number, fi.fee_type, fi.description AS invoice_description,
                    fi.academic_year_id,
                    ay.label AS academic_year_label,
                    s.fname, s.lname, s.regnumber,
                    f.fac_name  AS faculty_name,
                    d.dep_name  AS department_name,
                    s.combination AS option_name,
                    l.name      AS level_name,
                    u.full_name  AS recorded_by_name
             FROM `fee_payments` fp
             JOIN  `fee_invoices`  fi ON fi.id = fp.invoice_id
             LEFT JOIN `academic_years` ay ON ay.id   = fi.academic_year_id
             LEFT JOIN `student`    s  ON s.regnumber COLLATE utf8mb4_unicode_ci = fp.student_id COLLATE utf8mb4_unicode_ci
             LEFT JOIN `faculty`      f  ON f.fac_id   = s.faculty
             LEFT JOIN `departements` d  ON d.dep_id  = COALESCE(
                 NULLIF(CAST(s.department AS UNSIGNED), 0),
                 (SELECT dep_id FROM `departements` WHERE dep_acronym = s.department LIMIT 1)
             )
             LEFT JOIN `levels`       l  ON l.id      = CAST(s.current_level AS UNSIGNED)
             LEFT JOIN `users`      u  ON u.id        = fp.recorded_by
             WHERE fp.id = ?
             LIMIT 1",
            [$paymentId]
        );
    }

    /** Total collected for a student in a given academic year. */
    public function totalPaidByStudent(string $studentId, int $academicYearId): float
    {
        $row = $this->db->fetchOne(
            "SELECT SUM(fp.amount) AS total
             FROM `fee_payments` fp
             JOIN `fee_invoices` fi ON fi.id = fp.invoice_id
             WHERE fp.student_id COLLATE utf8mb4_unicode_ci = ? AND fi.academic_year_id = ? AND fp.status = 'confirmed'",
            [$studentId, $academicYearId]
        );
        return (float)($row['total'] ?? 0);
    }

    /** Count payments awaiting approval. */
    public function getPendingCount(): int
    {
        $row = $this->db->fetchOne("SELECT COUNT(*) AS cnt FROM `fee_payments` WHERE status = 'pending'", []);
        return (int)($row['cnt'] ?? 0);
    }
}
