<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Student ID cards.
 *
 * Table `student_ids`:
 *   id, student_id, issue_date, expiry_date, barcode, is_active, created_at
 *
 * One student may have a history of cards; only one is `is_active` at a time
 * (the current card). Issuing a new card deactivates the previous one.
 */
class StudentIdModel extends BaseModel
{
    protected string $table = 'student_ids';

    protected array $fillable = [
        'student_id',
        'issue_date',
        'expiry_date',
        'barcode',
        'is_active',
    ];

    /** Current active card for a student, or false. */
    public function activeForStudent(int $studentId): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM student_ids WHERE student_id = ? AND is_active = 1
             ORDER BY id DESC LIMIT 1",
            [$studentId]
        );
    }

    /** Full issuance history (newest first). */
    public function historyForStudent(int $studentId): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM student_ids WHERE student_id = ? ORDER BY id DESC",
            [$studentId]
        );
    }

    /** Deactivate every card for a student (called before issuing a fresh one). */
    public function deactivateAll(int $studentId): void
    {
        $this->db->execute(
            "UPDATE student_ids SET is_active = 0 WHERE student_id = ?",
            [$studentId]
        );
    }

    /**
     * Roster of students with their current card state.
     *
     * Drives the ID-card workspace: MANAGE_STUDENT_IDS is described as
     * "issue, re-issue, revoke and print", but until this query the only way
     * in was one student at a time through the student detail page.
     *
     * `card_state` is computed rather than stored so the caller can filter on
     * it without a schema change:
     *   none    — the student has never been issued a card
     *   active  — holds a card that has not expired
     *   expired — holds an active card whose expiry_date has passed
     *   revoked — every card they hold has been deactivated
     *
     * @param array{state?:string,keyword?:string,campus?:string,option_id?:int} $filters
     * @return array{rows: array, total: int}
     */
    public function roster(array $filters = [], int $page = 1, int $perPage = 25): array
    {
        $where  = ['1=1'];
        $params = [];

        $keyword = trim((string) ($filters['keyword'] ?? ''));
        if ($keyword !== '') {
            $where[] = "(s.regnumber LIKE ? OR CONCAT(s.fname, ' ', s.lname) LIKE ?)";
            $like = "%{$keyword}%";
            array_push($params, $like, $like);
        }

        $campus = trim((string) ($filters['campus'] ?? ''));
        if ($campus !== '') {
            $where[] = 's.campus = ?';
            $params[] = $campus;
        }

        $optionId = (int) ($filters['option_id'] ?? 0);
        if ($optionId > 0) {
            $where[] = 's.std_option = ?';
            $params[] = $optionId;
        }

        // The active card, if any — LIMIT 1 inside a correlated subquery keeps
        // this a single round trip regardless of how long a student's card
        // history is.
        $cardJoin = "LEFT JOIN `student_ids` c
                       ON c.id = (SELECT c2.id FROM `student_ids` c2
                                   WHERE c2.student_id = s.id AND c2.is_active = 1
                                   ORDER BY c2.id DESC LIMIT 1)";

        $stateExpr = "CASE
                        WHEN c.id IS NULL AND NOT EXISTS (SELECT 1 FROM `student_ids` c3 WHERE c3.student_id = s.id) THEN 'none'
                        WHEN c.id IS NULL THEN 'revoked'
                        WHEN c.expiry_date < CURDATE() THEN 'expired'
                        ELSE 'active'
                      END";

        $state = trim((string) ($filters['state'] ?? ''));
        $having = '';
        if (in_array($state, ['none', 'active', 'expired', 'revoked'], true)) {
            $having = 'HAVING card_state = ?';
        }

        $whereSql = implode(' AND ', $where);

        $countParams = $params;
        if ($having !== '') {
            $countParams[] = $state;
        }
        $countRow = $this->db->fetchOne(
            "SELECT COUNT(*) AS total FROM (
                SELECT s.id, {$stateExpr} AS card_state
                  FROM `student` s
                  {$cardJoin}
                 WHERE {$whereSql}
                 {$having}
             ) t",
            $countParams
        );
        $total = (int) ($countRow['total'] ?? 0);

        $perPage = max(1, min(200, $perPage));
        $offset  = max(0, ($page - 1) * $perPage);

        $rowParams = $params;
        if ($having !== '') {
            $rowParams[] = $state;
        }

        $rows = $this->db->fetchAll(
            "SELECT s.id            AS student_id,
                    s.regnumber,
                    s.fname,
                    s.lname,
                    s.photo,
                    s.campus,
                    s.student_state,
                    o.name          AS option_name,
                    c.id            AS card_id,
                    c.issue_date,
                    c.expiry_date,
                    c.barcode,
                    {$stateExpr}    AS card_state
               FROM `student` s
               {$cardJoin}
               LEFT JOIN `options` o ON o.id = s.std_option
              WHERE {$whereSql}
              {$having}
              ORDER BY s.regnumber ASC
              LIMIT {$perPage} OFFSET {$offset}",
            $rowParams
        );

        return ['rows' => $rows, 'total' => $total];
    }

    /** Look up a card by barcode (for verification). */
    public function findByBarcode(string $barcode): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM student_ids WHERE barcode = ? ORDER BY id DESC LIMIT 1",
            [$barcode]
        );
    }
}
