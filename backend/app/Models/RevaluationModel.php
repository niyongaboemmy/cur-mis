<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Exam/module result revaluation requests.
 *
 * Table `revaluations`:
 *   id, student_id, exam_id, reason, fee_paid,
 *   status enum('pending','approved','processed','rejected'),
 *   new_marks, reviewed_by, reviewed_at, created_at
 *
 * `exam_id` references the contested result — we store the `module_marks.id`
 * of the mark the student is contesting (the live marks system is keyed on
 * module_marks, not the legacy exams tables).
 */
class RevaluationModel extends BaseModel
{
    protected string $table = 'revaluations';

    protected array $fillable = [
        'student_id',
        'exam_id',
        'reason',
        'fee_paid',
        'status',
        'new_marks',
        'reviewed_by',
        'reviewed_at',
    ];

    public const STATUSES = ['pending', 'approved', 'processed', 'rejected'];

    /**
     * Staff list — every request with student + module context.
     * Optional filter by status.
     */
    public function adminList(?string $status = null): array
    {
        $where = '';
        $args  = [];
        if ($status && in_array($status, self::STATUSES, true)) {
            $where = 'WHERE r.status = ?';
            $args[] = $status;
        }

        return $this->db->fetchAll(
            "SELECT r.*,
                    s.regnumber, s.fname, s.lname,
                    mm.percentage AS current_marks, mm.grade AS current_grade,
                    m.module_code, m.module_name,
                    rv.full_name AS reviewed_by_name
             FROM revaluations r
             LEFT JOIN student s        ON s.id = r.student_id
             LEFT JOIN module_marks mm  ON mm.id = r.exam_id
             LEFT JOIN modules m        ON m.module_id = mm.module_id
             LEFT JOIN users rv         ON rv.id = r.reviewed_by
             {$where}
             ORDER BY FIELD(r.status,'pending','approved','processed','rejected'), r.created_at DESC",
            $args
        );
    }

    /** A single student's requests (newest first). */
    public function listForStudent(int $studentId): array
    {
        return $this->db->fetchAll(
            "SELECT r.*,
                    mm.percentage AS current_marks, mm.grade AS current_grade,
                    m.module_code, m.module_name
             FROM revaluations r
             LEFT JOIN module_marks mm ON mm.id = r.exam_id
             LEFT JOIN modules m       ON m.module_id = mm.module_id
             WHERE r.student_id = ?
             ORDER BY r.created_at DESC",
            [$studentId]
        );
    }

    /** True when a non-final (pending/approved) request already exists for this mark. */
    public function hasOpenRequest(int $studentId, int $markId): bool
    {
        $row = $this->db->fetchOne(
            "SELECT COUNT(*) AS c FROM revaluations
             WHERE student_id = ? AND exam_id = ? AND status IN ('pending','approved')",
            [$studentId, $markId]
        );
        return (int) ($row['c'] ?? 0) > 0;
    }

    /**
     * Backlog = failed modules for a student (percentage below the pass mark).
     * Pulled from the live module_marks data.
     */
    public function backlogForStudent(string $regnumber, float $passMark = 50.0): array
    {
        return $this->db->fetchAll(
            "SELECT mm.id AS mark_id, mm.percentage, mm.grade, mm.total,
                    m.module_id, m.module_code, m.module_name, m.module_credits,
                    t.label AS term_label, y.label AS year_label
             FROM module_marks mm
             LEFT JOIN modules m        ON m.module_id = mm.module_id
             LEFT JOIN academic_terms t ON t.id = mm.academic_term_id
             LEFT JOIN academic_years y ON y.id = t.academic_year_id
             WHERE mm.student_regnumber = ?
               AND mm.percentage IS NOT NULL
               AND mm.percentage < ?
               AND (mm.is_exempted IS NULL OR mm.is_exempted = 0)
             ORDER BY y.start_date DESC, t.start_date DESC, m.module_code ASC",
            [$regnumber, $passMark]
        );
    }
}
