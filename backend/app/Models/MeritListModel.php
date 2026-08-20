<?php

declare(strict_types=1);

namespace App\Models;

class MeritListModel extends BaseModel
{
    protected string $table    = 'merit_lists';
    protected array  $fillable = [
        'department_id', 'intake', 'academic_year_id',
        'application_id', 'merit_score', 'rank', 'is_qualified',
        'generated_at', 'generated_by',
    ];
    protected array $hidden = [];

    public function getForDeptIntake(int $departmentId, string $intake, int $yearId): array
    {
        return $this->db->fetchAll(
            "SELECT ml.*, sa.first_name, sa.last_name, sa.application_number,
                    sa.email, sa.combination, sa.prev_grade,
                    d.dep_name AS department_name
             FROM `merit_lists` ml
             JOIN `student_applications` sa ON sa.id  = ml.application_id
             JOIN `departements`         d  ON d.dep_id = ml.department_id
             WHERE ml.department_id = ? AND ml.intake = ? AND ml.academic_year_id = ?
             ORDER BY ml.rank ASC",
            [$departmentId, $intake, $yearId]
        );
    }

    public function clearForDeptIntake(int $departmentId, string $intake, int $yearId): void
    {
        $this->db->execute(
            "DELETE FROM `merit_lists`
             WHERE department_id = ? AND intake = ? AND academic_year_id = ?",
            [$departmentId, $intake, $yearId]
        );
    }

    public function countForDeptIntake(int $departmentId, string $intake, int $yearId): int
    {
        $row = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `merit_lists`
             WHERE department_id = ? AND intake = ? AND academic_year_id = ?",
            [$departmentId, $intake, $yearId]
        );
        return (int)($row['cnt'] ?? 0);
    }
}
