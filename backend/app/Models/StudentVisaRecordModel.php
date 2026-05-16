<?php

declare(strict_types=1);

namespace App\Models;

class StudentVisaRecordModel extends BaseModel
{
    protected string $table = 'student_visa_records';
    protected array $fillable = [
        'student_id', 'country_of_origin', 'entry_date',
        'visa_issue_date', 'visa_expiry_date', 'visa_type',
        'notes', 'is_current', 'created_by',
    ];

    /** History (newest first). */
    public function listForStudent(int $studentId): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM `student_visa_records` WHERE student_id = ? ORDER BY visa_issue_date DESC, id DESC",
            [$studentId]
        );
    }

    public function currentForStudent(int $studentId): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `student_visa_records` WHERE student_id = ? AND is_current = 1 ORDER BY visa_issue_date DESC LIMIT 1",
            [$studentId]
        );
    }

    /** Mark all existing records non-current. Call before inserting a renewal. */
    public function markAllNonCurrent(int $studentId): void
    {
        $this->db->execute(
            "UPDATE `student_visa_records` SET is_current = 0 WHERE student_id = ?",
            [$studentId]
        );
    }
}
