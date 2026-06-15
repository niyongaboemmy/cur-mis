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

    /** Look up a card by barcode (for verification). */
    public function findByBarcode(string $barcode): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM student_ids WHERE barcode = ? ORDER BY id DESC LIMIT 1",
            [$barcode]
        );
    }
}
