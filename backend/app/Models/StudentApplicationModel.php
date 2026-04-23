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
        'first_name', 'last_name', 'email', 'phone',
        'gender', 'birthdate', 'nationality', 'address',
        // Academic background
        'prev_school', 'prev_qualification', 'prev_grade',
        'combination', 'graduation_year',
        // Sponsorship
        'sponsorship', 'sponsor_name',
        // State machine
        'status', 'document_status', 'merit_score', 'merit_rank',
        // Tracking
        'submitted_at', 'reviewed_by', 'reviewed_at',
        'internal_notes', 'rejection_reason', 'ip_address',
        'email_verified', 'verification_code',
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
                    ay.label   AS academic_year_label
             FROM `student_applications` sa
             LEFT JOIN `departements`   d  ON d.dep_id   = sa.department_id
             LEFT JOIN `faculty`        f  ON f.fac_id   = sa.faculty_id
             LEFT JOIN `academic_years` ay ON ay.id      = sa.academic_year_id
             WHERE sa.id = ?
             LIMIT 1",
            [$id]
        );
    }

    public function paginateFiltered(int $page, int $perPage, array $filters): array
    {
        $page    = max(1, $page);
        $perPage = max(1, min(100, $perPage));
        $offset  = ($page - 1) * $perPage;

        $conditions = [];
        $bindings   = [];

        if (!empty($filters['search'])) {
            $s = "%{$filters['search']}%";
            $conditions[] = "(sa.first_name LIKE ? OR sa.last_name LIKE ? OR sa.email LIKE ? OR sa.application_number LIKE ?)";
            array_push($bindings, $s, $s, $s, $s);
        }

        if (!empty($filters['status'])) {
            $conditions[] = 'sa.status = ?';
            $bindings[]   = $filters['status'];
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

        if (!empty($filters['academic_year_id'])) {
            $conditions[] = 'sa.academic_year_id = ?';
            $bindings[]   = (int)$filters['academic_year_id'];
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
                    ay.label   AS academic_year_label
             FROM `student_applications` sa
             LEFT JOIN `departements`   d  ON d.dep_id   = sa.department_id
             LEFT JOIN `faculty`        f  ON f.fac_id   = sa.faculty_id
             LEFT JOIN `academic_years` ay ON ay.id      = sa.academic_year_id
             {$where}
             ORDER BY sa.id DESC
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
