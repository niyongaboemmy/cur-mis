<?php

declare(strict_types=1);

namespace App\Models;

class MeritCriteriaModel extends BaseModel
{
    protected string $table    = 'merit_criteria';
    protected array  $fillable = [
        'department_id', 'intake', 'academic_year_id',
        'grade_weight', 'combination_weight', 'other_weight',
        'min_grade', 'required_combinations', 'cutoff_score',
        'max_capacity', 'is_published', 'created_by',
    ];
    protected array $hidden = [];

    public function findForDeptIntake(int $departmentId, string $intake, int $yearId): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `merit_criteria`
             WHERE department_id = ? AND intake = ? AND academic_year_id = ?
             LIMIT 1",
            [$departmentId, $intake, $yearId]
        );
    }

    public function upsert(array $data): string
    {
        $existing = $this->findForDeptIntake(
            (int)$data['department_id'],
            (string)$data['intake'],
            (int)$data['academic_year_id']
        );

        if ($existing) {
            $this->update((int)$existing['id'], $data);
            return (string)$existing['id'];
        }

        return $this->create($data);
    }
}
