<?php

declare(strict_types=1);

namespace App\Models;

class StudentApplicationModel extends BaseModel
{
    protected string $table    = 'student_applications';
    protected array  $fillable = [
        'application_number',
        // Institutional context
        'academic_year_id', 'faculty_id', 'department_id', 'intake',
        // Personal information
        'first_name', 'last_name', 'father', 'mother',
        'email', 'phone', 'reference_phone',
        'gender', 'birthdate', 'marital_status',
        'nationality', 'country_of_residence', 'national_id',
        'visa_obtained_date', 'visa_expiration_date',
        'disability', 'address',
        'province', 'district', 'sector', 'residence_district',
        // Academic background
        'prev_school', 'prev_qualification', 'prev_grade',
        'combination', 'graduation_year',
        'a2_grades', 'principal_passes', 'serial_number',
        // Program selection (step 3 of the apply wizard)
        'program_id', 'campus_id', 'mode_of_study', 'level_id',
        // Payment (step 5 of the apply wizard)
        'transaction_id', 'payment_slip_file_id', 'payment_slip_mime', 'payment_amount', 'payment_currency', 'paid_at',
        // Sponsorship
        'sponsorship', 'sponsor_name',
        // State machine
        'status', 'document_status', 'merit_score', 'merit_rank',
        // Tracking
        'submitted_at', 'auto_submitted', 'reviewed_by', 'reviewed_at',
        'internal_notes', 'rejection_reason', 'ip_address',
        'email_verified', 'verification_code',
        // Task 1.11 — credit-transfer workflow
        'is_credit_transfer', 'credit_transfer_from', 'exemption_letter_status',
        'exemption_letter_received_at', 'entry_level_override',
        // Task 1.9 — hidden flag
        'is_hidden', 'hidden_at', 'hidden_by', 'hidden_reason',
    ];
    protected array $hidden = [];

    public function findByApplicationNumber(string $number): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `student_applications` WHERE application_number = ? LIMIT 1",
            [$number]
        );
    }

    public function generateApplicationNumber(): string
    {
        $year = date('Y');
        $row  = $this->db->fetchOne("SELECT MAX(id) AS max_id FROM `student_applications`");
        $seq  = ((int)($row['max_id'] ?? 0)) + 1;
        return sprintf('APP-%s-%05d', $year, $seq);
    }

    public function getWithDetails(int $id): array|false
    {
        return $this->db->fetchOne(
            "SELECT sa.*,
                    d.dep_name    AS department_name,
                    d.dep_acronym AS department_code,
                    f.fac_name AS faculty_name, f.fac_code AS faculty_code,
                    ay.label   AS academic_year_label,
                    ao.student_id, ao.offer_letter_reference,
                    o.name     AS program_name,
                    c.name     AS campus_name, c.code AS campus_code, c.location AS campus_location,
                    l.name     AS level_name,
                    COALESCE(ap.profile_photo_id, u.photo) AS applicant_photo_id
             FROM `student_applications` sa
             LEFT JOIN `departements`    d  ON d.dep_id   = sa.department_id
             LEFT JOIN `faculty`         f  ON f.fac_id   = sa.faculty_id
             LEFT JOIN `academic_years`  ay ON ay.id      = sa.academic_year_id
             LEFT JOIN `admission_offers` ao ON ao.application_id = sa.id
             LEFT JOIN `options`         o  ON o.id       = sa.program_id
             LEFT JOIN `campuses`        c  ON c.id       = sa.campus_id
             LEFT JOIN `levels`          l  ON l.id       = sa.level_id
             LEFT JOIN `applicant_profiles` ap ON ap.application_id = sa.id
             LEFT JOIN `users`              u  ON u.id = ap.user_id
             WHERE sa.id = ?
             LIMIT 1",
            [$id]
        );
    }

    /**
     * Turn a pair of YYYY-MM-DD strings into half-open timestamp bounds
     * [from, to) suitable for comparing against a DATETIME column.
     *
     * Returns [null, null] for absent or unparseable input, so a malformed
     * value from a query string widens the result set rather than throwing or
     * silently matching nothing. Bounds arriving the wrong way round are
     * swapped — a user who picks the dates in the wrong order gets the range
     * they clearly meant instead of an empty table.
     *
     * @return array{0: ?string, 1: ?string}
     */
    public static function dateRangeBounds(?string $from, ?string $to): array
    {
        $parse = static function (?string $v): ?\DateTimeImmutable {
            $v = trim((string) $v);
            if ($v === '') return null;
            // Accept the full timestamp the browser sometimes sends, but only
            // ever use the date part — the bounds are whole days.
            $day = substr($v, 0, 10);
            $d   = \DateTimeImmutable::createFromFormat('!Y-m-d', $day);
            // createFromFormat overflows rather than failing, so "2026-02-29"
            // in a non-leap year would quietly become 1 March. Only accept a
            // value that round-trips to exactly what was asked for.
            return ($d && $d->format('Y-m-d') === $day) ? $d : null;
        };

        $f = $parse($from);
        $t = $parse($to);

        if ($f !== null && $t !== null && $f > $t) {
            [$f, $t] = [$t, $f];
        }

        return [
            $f?->format('Y-m-d 00:00:00'),
            // Exclusive upper bound: the day after the one the user picked, so
            // the whole of the chosen end day is included.
            $t?->modify('+1 day')->format('Y-m-d 00:00:00'),
        ];
    }

    public function paginateFiltered(int $page, int $perPage, array $filters): array
    {
        $page    = max(1, $page);
        $perPage = max(1, min(100, $perPage));
        $offset  = ($page - 1) * $perPage;

        $conditions = [];
        $bindings   = [];
        $orderBy    = 'sa.id DESC';

        if (!empty($filters['search'])) {
            $s = "%{$filters['search']}%";
            $conditions[] = "(sa.first_name LIKE ? OR sa.last_name LIKE ? OR sa.email LIKE ? OR sa.application_number LIKE ?)";
            array_push($bindings, $s, $s, $s, $s);
        }

        if (!empty($filters['status'])) {
            // "pending" is a UI pseudo-status meaning "anything still in the
            // active review queue" — covers raw submissions AND those an
            // admin has already started reviewing. Lets the Pending tile
            // surface the full to-do list rather than only the first stage.
            // Mirrors the "In Review" / "Offers" / "Action" stat tiles on the
            // Applications page, which each sum more than one raw status —
            // without these, clicking a tile applies a single-status filter
            // that can't reproduce the tile's own count.
            if ($filters['status'] === 'pending') {
                $conditions[] = "sa.status IN ('submitted', 'documents_under_review')";
            } elseif ($filters['status'] === 'in_review') {
                $conditions[] = "sa.status IN ('documents_under_review', 'documents_verified')";
            } elseif ($filters['status'] === 'offers_queue') {
                $conditions[] = "sa.status IN ('offered', 'offer_accepted')";
            } elseif ($filters['status'] === 'action_needed') {
                $conditions[] = "sa.status IN ('documents_rejected', 'requested_changes')";
            } else {
                $conditions[] = 'sa.status = ?';
                $bindings[]   = $filters['status'];
            }
        } else {
            // Drafts are applicant-side work-in-progress; never surface them
            // to admin views unless explicitly filtered in.
            $conditions[] = "sa.status <> 'draft'";
        }

        if (!empty($filters['faculty_id'])) {
            $conditions[] = 'sa.faculty_id = ?';
            $bindings[]   = (int)$filters['faculty_id'];
        }

        if (!empty($filters['department_id'])) {
            $conditions[] = 'sa.department_id = ?';
            $bindings[]   = (int)$filters['department_id'];
        }

        if (!empty($filters['intake'])) {
            $conditions[] = 'sa.intake = ?';
            $bindings[]   = $filters['intake'];
        }

        if (!empty($filters['campus_id'])) {
            $conditions[] = 'sa.campus_id = ?';
            $bindings[]   = (int)$filters['campus_id'];
        }

        // Server-side campus scoping (registry assistants are limited to
        // applications belonging to the campus(es) assigned to their user).
        // An empty array passed in means "user has no assignments yet — show
        // nothing"; null/unset means "no scoping required (admin)".
        if (isset($filters['campus_scope_ids']) && is_array($filters['campus_scope_ids'])) {
            $ids = array_values(array_filter(array_map('intval', $filters['campus_scope_ids']), fn($v) => $v > 0));
            if (empty($ids)) {
                // Force an empty result set — the user is scoped but has zero campuses.
                $conditions[] = '1 = 0';
            } else {
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $conditions[] = "sa.campus_id IN ($placeholders)";
                foreach ($ids as $cid) {
                    $bindings[] = $cid;
                }
            }
        }

        if (!empty($filters['mode_of_study'])) {
            $conditions[] = 'sa.mode_of_study = ?';
            $bindings[]   = $filters['mode_of_study'];
        }

        if (!empty($filters['academic_year_id'])) {
            $conditions[] = 'sa.academic_year_id = ?';
            $bindings[]   = (int)$filters['academic_year_id'];
        }

        if (!empty($filters['level_id'])) {
            $conditions[] = 'sa.level_id = ?';
            $bindings[]   = (int)$filters['level_id'];
        }

        // Task 1.8 — gender / payment status filters.
        // Gender values vary across legacy rows ('M'/'F' vs 'Male'/'Female');
        // we match the leading initial to be tolerant.
        if (!empty($filters['gender'])) {
            $g = strtoupper(substr((string)$filters['gender'], 0, 1));
            if (in_array($g, ['M', 'F', 'O'], true)) {
                $conditions[] = "UPPER(LEFT(IFNULL(sa.gender, ''), 1)) = ?";
                $bindings[]   = $g;
            }
        }

        if (!empty($filters['payment_status'])) {
            $ps = (string)$filters['payment_status'];
            // "Paid" now means the Urubuto Pay application fee was confirmed
            // (transaction_id + paid_at set by the gateway callback), not that a
            // bank slip was uploaded.
            if ($ps === 'paid') {
                $conditions[] = "(sa.paid_at IS NOT NULL AND sa.transaction_id IS NOT NULL)";
            } elseif ($ps === 'unpaid') {
                $conditions[] = "(sa.paid_at IS NULL OR sa.transaction_id IS NULL)";
            }
        }

        if (!empty($filters['sort_paid_first'])) {
            // Pin paid applications to the top, then newest-first within each group.
            $orderBy = '(sa.paid_at IS NOT NULL) DESC, sa.id DESC';
        }

        if (!empty($filters['hidden_filter'])) {
            if ($filters['hidden_filter'] === 'exclude') {
                $conditions[] = '(sa.is_hidden IS NULL OR sa.is_hidden = 0)';
            } elseif ($filters['hidden_filter'] === 'only') {
                $conditions[] = 'sa.is_hidden = 1';
            }
        }

        if (!empty($filters['has_pending_docs'])) {
            $conditions[] = "EXISTS (SELECT 1 FROM `application_documents` ad WHERE ad.application_id = sa.id AND ad.verification_status = 'pending')";
        }

        // Submission date range. Either bound may be given on its own.
        //
        // Expressed as a half-open interval [from 00:00:00, to+1day 00:00:00)
        // rather than DATE(sa.submitted_at) BETWEEN ? AND ?, for two reasons:
        // wrapping the column in DATE() makes idx_sa_submitted_at unusable, and
        // `submitted_at <= '2026-08-20'` would silently drop everything
        // submitted during that final day, since a bare date compares as
        // midnight. Callers pass plain YYYY-MM-DD.
        [$from, $to] = self::dateRangeBounds(
            $filters['submitted_from'] ?? null,
            $filters['submitted_to']   ?? null
        );
        if ($from !== null) {
            $conditions[] = 'sa.submitted_at >= ?';
            $bindings[]   = $from;
        }
        if ($to !== null) {
            $conditions[] = 'sa.submitted_at < ?';
            $bindings[]   = $to;
        }

        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        $total = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `student_applications` sa {$where}",
            $bindings
        )['cnt'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT sa.*,
                    d.dep_name    AS department_name,
                    d.dep_acronym AS department_code,
                    f.fac_name AS faculty_name, f.fac_code AS faculty_code,
                    ay.label   AS academic_year_label,
                    o.name     AS program_name,
                    c.name     AS campus_name, c.code AS campus_code, c.location AS campus_location,
                    l.name     AS level_name,
                    COALESCE(ap.profile_photo_id, u.photo) AS applicant_photo_id,
                    (SELECT COUNT(*) FROM application_documents WHERE application_id = sa.id AND verification_status = 'pending') AS pending_docs_count,
                    (SELECT COUNT(*) FROM application_documents WHERE application_id = sa.id AND verification_status = 'verified') AS verified_docs_count,
                    (SELECT COUNT(*) FROM application_documents WHERE application_id = sa.id AND verification_status = 'rejected') AS rejected_docs_count
             FROM `student_applications` sa
             LEFT JOIN `departements`   d  ON d.dep_id   = sa.department_id
             LEFT JOIN `faculty`        f  ON f.fac_id   = sa.faculty_id
             LEFT JOIN `academic_years` ay ON ay.id      = sa.academic_year_id
             LEFT JOIN `options`        o  ON o.id       = sa.program_id
             LEFT JOIN `campuses`       c  ON c.id       = sa.campus_id
             LEFT JOIN `levels`         l  ON l.id       = sa.level_id
             LEFT JOIN `applicant_profiles` ap ON ap.application_id = sa.id
             LEFT JOIN `users`              u  ON u.id = ap.user_id
             {$where}
             ORDER BY {$orderBy}
             LIMIT ? OFFSET ?",
            [...$bindings, $perPage, $offset]
        );

        return [
            'data'         => $rows,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / $perPage),
        ];
    }

    /**
     * Check for an active (non-withdrawn, non-declined) duplicate application.
     */
    public function existsActiveForDeptIntake(string $email, int $departmentId, string $intake, int $academicYearId): bool
    {
        $row = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `student_applications`
             WHERE email = ? AND department_id = ? AND intake = ? AND academic_year_id = ?
             AND status NOT IN ('withdrawn', 'offer_declined')",
            [$email, $departmentId, $intake, $academicYearId]
        );
        return ($row['cnt'] ?? 0) > 0;
    }
}
