<?php

declare(strict_types=1);

namespace App\Models;

class StaffQualificationModel extends BaseModel
{
    protected string $table      = 'staff_qualifications';
    protected string $primaryKey = 'id';
    protected array  $fillable   = [
        'employee_id',
        'type',
        'title',
        'institution',
        'field_of_study',
        'year_obtained',
        'grade_result',
        'description',
    ];

    public function findByEmployee(int $employeeId): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM `staff_qualifications`
             WHERE employee_id = ?
             ORDER BY year_obtained DESC, type ASC, id ASC",
            [$employeeId]
        );
    }
}
