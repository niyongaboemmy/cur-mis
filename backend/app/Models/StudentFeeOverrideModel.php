<?php

declare(strict_types=1);

namespace App\Models;

class StudentFeeOverrideModel extends BaseModel
{
    protected string $table = 'student_fee_overrides';
    protected array $fillable = [
        'student_id', 'academic_year_id', 'fee_type', 'amount', 'reason', 'created_by',
    ];

    /** Return the override for a specific student + year + fee_type, or false. */
    public function findOverride(string $studentId, int $academicYearId, string $feeType): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `student_fee_overrides`
             WHERE student_id COLLATE utf8mb4_unicode_ci = ? AND academic_year_id = ? AND fee_type = ?
             LIMIT 1",
            [$studentId, $academicYearId, $feeType]
        );
    }

    /** List all overrides for a student in an academic year with user join. */
    public function listForStudent(string $studentId, int $academicYearId): array
    {
        return $this->db->fetchAll(
            "SELECT sfo.*, u.full_name AS created_by_name
             FROM `student_fee_overrides` sfo
             LEFT JOIN `users` u ON u.id = sfo.created_by
             WHERE sfo.student_id COLLATE utf8mb4_unicode_ci = ? AND sfo.academic_year_id = ?
             ORDER BY sfo.fee_type",
            [$studentId, $academicYearId]
        );
    }

    /**
     * Insert or update an override.
     * Uses the UNIQUE KEY uq_override_student_year_type to avoid duplicates.
     */
    public function upsert(array $data): void
    {
        $this->db->execute(
            "INSERT INTO `student_fee_overrides`
                (student_id, academic_year_id, fee_type, amount, reason, created_by)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                amount     = VALUES(amount),
                reason     = VALUES(reason),
                created_by = VALUES(created_by),
                updated_at = CURRENT_TIMESTAMP",
            [
                $data['student_id'],
                (int)$data['academic_year_id'],
                $data['fee_type'],
                (float)$data['amount'],
                $data['reason'] ?? '',
                (int)$data['created_by'],
            ]
        );
    }
}
