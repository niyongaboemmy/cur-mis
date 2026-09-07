<?php

declare(strict_types=1);

namespace App\Models;

class AppraisalModel extends BaseModel
{
    protected string $table      = 'appraisals';
    protected string $primaryKey = 'id';
    protected array  $fillable   = [
        'period_id', 'employee_id', 'status',
        'self_comment', 'supervisor_comment', 'hr_comment',
        'self_total_score', 'supervisor_total_score', 'final_score', 'final_grade',
        'submitted_at', 'supervisor_reviewed_at', 'completed_at',
    ];

    /* ── Periods ────────────────────────────────────────────────────────── */

    public function listPeriods(array $filters = []): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['status'])) {
            $where[]    = 'status = ?';
            $bindings[] = $filters['status'];
        }
        if (!empty($filters['year'])) {
            $where[]    = 'year = ?';
            $bindings[] = (int)$filters['year'];
        }

        $sql = "SELECT p.*,
                    (SELECT COUNT(*) FROM appraisal_criteria WHERE period_id = p.id)  AS criteria_count,
                    (SELECT COUNT(*) FROM appraisals           WHERE period_id = p.id) AS appraisal_count
                FROM appraisal_periods p"
             . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
             . ' ORDER BY p.year DESC, p.start_date DESC';

        return $this->db->fetchAll($sql, $bindings);
    }

    public function findPeriod(int $id): ?array
    {
        $row = $this->db->fetchOne(
            "SELECT p.*,
                    (SELECT COUNT(*) FROM appraisal_criteria WHERE period_id = p.id)  AS criteria_count,
                    (SELECT COUNT(*) FROM appraisals           WHERE period_id = p.id) AS appraisal_count
             FROM appraisal_periods p WHERE p.id = ?",
            [$id]
        );
        return $row ?: null;
    }

    /** Blank date strings from the form must become SQL NULL, not '' (which MySQL rejects in strict mode). */
    private static function nullableDate($value): ?string
    {
        $value = is_string($value) ? trim($value) : $value;
        return ($value === '' || $value === null) ? null : $value;
    }

    public function createPeriod(array $data): int
    {
        $this->db->execute(
            "INSERT INTO appraisal_periods (title, period_type, year, start_date, end_date, submission_deadline, status, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $data['title'],
                $data['period_type'],
                $data['year'],
                self::nullableDate($data['start_date'] ?? null),
                self::nullableDate($data['end_date'] ?? null),
                self::nullableDate($data['submission_deadline'] ?? null),
                $data['status'] ?? 'Draft',
                $data['description'] ?? null,
            ]
        );
        return (int)$this->db->lastInsertId();
    }

    public function updatePeriod(int $id, array $data): void
    {
        $sets     = [];
        $bindings = [];
        $allowed  = ['title','period_type','year','start_date','end_date','submission_deadline','status','description'];
        foreach ($allowed as $col) {
            if (array_key_exists($col, $data)) {
                $sets[]     = "$col = ?";
                $bindings[] = in_array($col, ['start_date','end_date','submission_deadline'], true)
                    ? self::nullableDate($data[$col])
                    : $data[$col];
            }
        }
        if (!$sets) return;
        $bindings[] = $id;
        $this->db->execute("UPDATE appraisal_periods SET " . implode(', ', $sets) . " WHERE id = ?", $bindings);
    }

    public function deletePeriod(int $id): void
    {
        $this->db->execute('DELETE FROM appraisal_periods WHERE id = ?', [$id]);
    }

    /* ── Criteria ───────────────────────────────────────────────────────── */

    public function listCriteria(int $periodId): array
    {
        return $this->db->fetchAll(
            'SELECT * FROM appraisal_criteria WHERE period_id = ? ORDER BY sort_order ASC, id ASC',
            [$periodId]
        );
    }

    public function createCriterion(array $data): int
    {
        $this->db->execute(
            "INSERT INTO appraisal_criteria (period_id, name, description, weight, max_score, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)",
            [
                $data['period_id'],
                $data['name'],
                $data['description'] ?? null,
                $data['weight'] ?? 1.00,
                $data['max_score'] ?? 5,
                $data['sort_order'] ?? 0,
            ]
        );
        return (int)$this->db->lastInsertId();
    }

    public function updateCriterion(int $id, array $data): void
    {
        $sets     = [];
        $bindings = [];
        $allowed  = ['name','description','weight','max_score','sort_order'];
        foreach ($allowed as $col) {
            if (array_key_exists($col, $data)) {
                $sets[]     = "$col = ?";
                $bindings[] = $data[$col];
            }
        }
        if (!$sets) return;
        $bindings[] = $id;
        $this->db->execute("UPDATE appraisal_criteria SET " . implode(', ', $sets) . " WHERE id = ?", $bindings);
    }

    public function deleteCriterion(int $id): void
    {
        $this->db->execute('DELETE FROM appraisal_criteria WHERE id = ?', [$id]);
    }

    /* ── Appraisals ─────────────────────────────────────────────────────── */

    public function listAppraisals(array $filters = []): array
    {
        $where    = ['1=1'];
        $bindings = [];

        if (!empty($filters['period_id'])) {
            $where[]    = 'a.period_id = ?';
            $bindings[] = (int)$filters['period_id'];
        }
        if (!empty($filters['employee_id'])) {
            $where[]    = 'a.employee_id = ?';
            $bindings[] = (int)$filters['employee_id'];
        }
        if (!empty($filters['status'])) {
            $where[]    = 'a.status = ?';
            $bindings[] = $filters['status'];
        }

        return $this->db->fetchAll(
            "SELECT a.*,
                    CONCAT(e.employee_fname,' ',e.employee_lname) AS employee_name,
                    e.employee_post AS department,
                    e.employee_position AS position,
                    p.title AS period_title,
                    p.year  AS period_year
             FROM appraisals a
             JOIN employees          e ON e.employee_id = a.employee_id
             JOIN appraisal_periods  p ON p.id = a.period_id
             WHERE " . implode(' AND ', $where) . "
             ORDER BY a.updated_at DESC",
            $bindings
        );
    }

    public function findAppraisal(int $id): ?array
    {
        $row = $this->db->fetchOne(
            "SELECT a.*,
                    CONCAT(e.employee_fname,' ',e.employee_lname) AS employee_name,
                    e.employee_post      AS department,
                    e.employee_position  AS position,
                    e.employee_gender    AS gender,
                    p.title              AS period_title,
                    p.year               AS period_year,
                    p.submission_deadline
             FROM appraisals a
             JOIN employees          e ON e.employee_id = a.employee_id
             JOIN appraisal_periods  p ON p.id = a.period_id
             WHERE a.id = ?",
            [$id]
        );
        if (!$row) return null;

        $row['ratings'] = $this->db->fetchAll(
            "SELECT r.*, c.name AS criterion_name, c.description AS criterion_description,
                    c.weight, c.max_score, c.sort_order
             FROM appraisal_ratings r
             JOIN appraisal_criteria c ON c.id = r.criterion_id
             WHERE r.appraisal_id = ?
             ORDER BY c.sort_order ASC, c.id ASC",
            [$id]
        );

        return $row;
    }

    public function initiateAppraisals(int $periodId): array
    {
        $employees = $this->db->fetchAll(
            "SELECT employee_id FROM employees WHERE account_status = 'Active'",
            []
        );

        $created = 0;
        $skipped = 0;
        foreach ($employees as $emp) {
            $exists = $this->db->fetchOne(
                'SELECT id FROM appraisals WHERE period_id = ? AND employee_id = ?',
                [$periodId, $emp['employee_id']]
            );
            if ($exists) { $skipped++; continue; }

            $this->db->execute(
                "INSERT INTO appraisals (period_id, employee_id, status) VALUES (?, ?, 'Draft')",
                [$periodId, $emp['employee_id']]
            );
            $created++;
        }

        return ['created' => $created, 'skipped' => $skipped];
    }

    /* ── Ratings ─────────────────────────────────────────────────────────── */

    public function upsertRating(int $appraisalId, int $criterionId, array $data): void
    {
        $existing = $this->db->fetchOne(
            'SELECT id FROM appraisal_ratings WHERE appraisal_id = ? AND criterion_id = ?',
            [$appraisalId, $criterionId]
        );

        if ($existing) {
            $sets     = [];
            $bindings = [];
            foreach (['self_score','supervisor_score','self_comment','supervisor_comment'] as $col) {
                if (array_key_exists($col, $data)) {
                    $sets[]     = "$col = ?";
                    $bindings[] = $data[$col];
                }
            }
            if ($sets) {
                $bindings[] = $existing['id'];
                $this->db->execute("UPDATE appraisal_ratings SET " . implode(', ', $sets) . " WHERE id = ?", $bindings);
            }
        } else {
            $this->db->execute(
                "INSERT INTO appraisal_ratings (appraisal_id, criterion_id, self_score, supervisor_score, self_comment, supervisor_comment)
                 VALUES (?, ?, ?, ?, ?, ?)",
                [
                    $appraisalId, $criterionId,
                    $data['self_score'] ?? null,
                    $data['supervisor_score'] ?? null,
                    $data['self_comment'] ?? null,
                    $data['supervisor_comment'] ?? null,
                ]
            );
        }
    }

    /** Compute weighted average score from ratings for a given role (self|supervisor). */
    public function computeScore(int $appraisalId, string $role): ?float
    {
        $col = $role === 'self' ? 'r.self_score' : 'r.supervisor_score';
        $row = $this->db->fetchOne(
            "SELECT SUM($col * c.weight) / SUM(c.weight) AS avg_score
             FROM appraisal_ratings r
             JOIN appraisal_criteria c ON c.id = r.criterion_id
             WHERE r.appraisal_id = ? AND $col IS NOT NULL",
            [$appraisalId]
        );
        return isset($row['avg_score']) ? round((float)$row['avg_score'], 2) : null;
    }

    /* ── Stats ───────────────────────────────────────────────────────────── */

    public function stats(): array
    {
        $periods    = $this->db->fetchOne('SELECT COUNT(*) AS c FROM appraisal_periods',  [])['c'] ?? 0;
        $active     = $this->db->fetchOne("SELECT COUNT(*) AS c FROM appraisal_periods WHERE status='Active'", [])['c'] ?? 0;
        $total      = $this->db->fetchOne('SELECT COUNT(*) AS c FROM appraisals', [])['c'] ?? 0;
        $completed  = $this->db->fetchOne("SELECT COUNT(*) AS c FROM appraisals WHERE status='Completed'", [])['c'] ?? 0;
        $pending    = $this->db->fetchOne("SELECT COUNT(*) AS c FROM appraisals WHERE status IN ('Draft','Self-Review')", [])['c'] ?? 0;
        $inReview   = $this->db->fetchOne("SELECT COUNT(*) AS c FROM appraisals WHERE status IN ('Supervisor-Review','HR-Review')", [])['c'] ?? 0;

        $byStatus = $this->db->fetchAll(
            "SELECT status, COUNT(*) AS total FROM appraisals GROUP BY status ORDER BY status",
            []
        );

        return compact('periods','active','total','completed','pending','inReview','byStatus');
    }
}
