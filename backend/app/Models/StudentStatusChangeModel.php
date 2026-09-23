<?php

declare(strict_types=1);

namespace App\Models;

use Core\Database;

/**
 * Audit trail for `student.student_state` changes (migration 145).
 *
 * The student row keeps the CURRENT state; this table keeps how it got there —
 * the previous value, the reason, the supporting document and who made the
 * call. Nothing reads a student's status from here.
 */
class StudentStatusChangeModel
{
    private Database $db;

    /** States the registry may only set together with a written reason. */
    public const REASON_REQUIRED = ['rejected', 'dropped'];

    /** States the registry may only set together with a supporting document. */
    public const DOCUMENT_REQUIRED = ['deceased'];

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /**
     * Record one status change.
     *
     * @param array{
     *   student_id:int, previous_state:?string, new_state:string, reason:?string,
     *   document_file_server_id?:?string, document_original_name?:?string,
     *   document_mime?:?string, document_size?:?int, changed_by:?int
     * } $data
     */
    public function record(array $data): int
    {
        $this->db->execute(
            "INSERT INTO `student_status_changes`
               (student_id, previous_state, new_state, reason,
                document_file_server_id, document_original_name,
                document_mime, document_size, changed_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (int) $data['student_id'],
                $data['previous_state'] ?? null,
                (string) $data['new_state'],
                ($data['reason'] ?? '') !== '' ? $data['reason'] : null,
                $data['document_file_server_id'] ?? null,
                $data['document_original_name']  ?? null,
                $data['document_mime']           ?? null,
                isset($data['document_size']) ? (int) $data['document_size'] : null,
                $data['changed_by'] ?? null,
            ]
        );

        return (int) $this->db->lastInsertId();
    }

    /** Newest-first history for one student, with the actor's name resolved. */
    public function forStudent(int $studentId, int $limit = 50): array
    {
        return $this->db->fetchAll(
            "SELECT sc.*, u.full_name AS changed_by_name
               FROM `student_status_changes` sc
               LEFT JOIN `users` u ON u.id = sc.changed_by
              WHERE sc.student_id = ?
              ORDER BY sc.changed_at DESC, sc.id DESC
              LIMIT {$limit}",
            [$studentId]
        );
    }

    /** One change by id — used to stream its supporting document back. */
    public function find(int $id): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `student_status_changes` WHERE id = ? LIMIT 1",
            [$id]
        );
    }
}
