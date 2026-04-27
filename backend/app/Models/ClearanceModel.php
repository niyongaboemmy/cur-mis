<?php

declare(strict_types=1);

namespace App\Models;



class ClearanceModel extends BaseModel
{
    protected string $table      = 'student_clearances';
    protected string $primaryKey = 'id';

    /**
     * Get clearance record for a specific student / year / semester.
     */
    public function getForStudent(string $studentId, int $yearId, ?int $semester = null): ?array
    {
        $sql = "SELECT sc.*,
                       u.full_name                           AS cleared_by_name,
                       ay.label                              AS academic_year_label
                FROM `student_clearances` sc
                LEFT JOIN `users` u           ON u.id  = sc.cleared_by
                LEFT JOIN `academic_years` ay ON ay.id = sc.academic_year_id
                WHERE sc.student_id = ? AND sc.academic_year_id = ?";
        $params = [$studentId, $yearId];

        if ($semester !== null) {
            $sql    .= ' AND sc.semester = ?';
            $params[] = $semester;
        } else {
            $sql .= ' AND sc.semester IS NULL';
        }

        $sql .= ' LIMIT 1';
        return $this->db->fetchOne($sql, $params) ?: null;
    }

    /**
     * Bulk clearance listing for a full academic year.
     */
    public function getBulkForYear(int $yearId, int $page = 1, int $perPage = 50): array
    {
        $offset = ($page - 1) * $perPage;

        $total = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `student_clearances`
             WHERE academic_year_id = ? AND semester IS NULL",
            [$yearId]
        )['cnt'] ?? 0);

        $data = $this->db->fetchAll(
            "SELECT sc.*,
                    s.fname, s.lname, s.regnumber,
                    u.full_name                           AS cleared_by_name,
                    ay.label                              AS academic_year_label,
                    dep.dep_name                          AS department_name
             FROM `student_clearances` sc
             JOIN  `student` s            ON s.regnumber = sc.student_id
             LEFT JOIN `users` u          ON u.id        = sc.cleared_by
             LEFT JOIN `academic_years` ay ON ay.id      = sc.academic_year_id
             LEFT JOIN `departements` dep ON dep.dep_id  = s.department
             WHERE sc.academic_year_id = ? AND sc.semester IS NULL
             ORDER BY sc.status ASC, s.lname ASC
             LIMIT ? OFFSET ?",
            [$yearId, $perPage, $offset]
        );

        return [
            'data'         => $data,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => max(1, (int)ceil($total / $perPage)),
        ];
    }

    /**
     * Upsert a clearance record (insert or update based on unique key).
     */
    public function upsert(array $data): void
    {
        $existing = $this->getForStudent(
            $data['student_id'],
            $data['academic_year_id'],
            $data['semester'] ?? null
        );

        if ($existing) {
            $this->update((int)$existing['id'], $data);
        } else {
            $this->create($data);
        }
    }
}
