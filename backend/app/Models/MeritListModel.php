<?php

declare(strict_types=1);

namespace App\Models;

class MeritListModel extends BaseModel
{
    protected string $table    = 'merit_lists';
    protected array  $fillable = [
        'program_id', 'intake', 'academic_year_id',
        'application_id', 'merit_score', 'rank', 'is_qualified',
        'generated_at', 'generated_by',
    ];
    protected array $hidden = [];

    public function getForProgramIntake(int $programId, string $intake, int $yearId): array
    {
        return $this->db->fetchAll(
            "SELECT ml.*, sa.first_name, sa.last_name, sa.application_number,
                    sa.email, sa.combination, sa.prev_grade, p.name AS program_name
             FROM `merit_lists` ml
             JOIN `student_applications` sa ON sa.id = ml.application_id
             JOIN `programs` p ON p.id = ml.program_id
             WHERE ml.program_id = ? AND ml.intake = ? AND ml.academic_year_id = ?
             ORDER BY ml.rank ASC",
            [$programId, $intake, $yearId]
        );
    }

    public function clearForProgramIntake(int $programId, string $intake, int $yearId): void
    {
        $this->db->execute(
            "DELETE FROM `merit_lists` WHERE program_id = ? AND intake = ? AND academic_year_id = ?",
            [$programId, $intake, $yearId]
        );
    }

    public function countForProgramIntake(int $programId, string $intake, int $yearId): int
    {
        $row = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `merit_lists`
             WHERE program_id = ? AND intake = ? AND academic_year_id = ?",
            [$programId, $intake, $yearId]
        );
        return (int)($row['cnt'] ?? 0);
    }
}
