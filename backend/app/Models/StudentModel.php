<?php

declare(strict_types=1);

namespace App\Models;

class StudentModel extends BaseModel
{
    // Point to student table, though students view is available for read-only
    protected string $table = 'student';
    protected array $fillable = [
        'user_id', 'parent_student_id',
        'regnumber', 'fname', 'lname', 'phone', 'email', 'gender',
        'birthdate', 'nationality', 'program', 'std_option', 'faculty',
        'department', 'current_level', 'programme_level', 'programme_category',
        'registration_date', 'student_state',
        'intake', 'acc_year', 'campus', 'combination', 'last_school', 'sponsor',
        'photo', 'marital_status', 'spouse', 'disability',
        'father', 'mother', 'reference', 'id_card', 'country',
        'province', 'district', 'sector', 'cell', 'village',
        'index_number', 'learning_mode',
    ];

    /**
     * Walk `parent_student_id` upwards to return the student's prior
     * programme rows (oldest enrollment last). Used to surface the
     * "previously enrolled as undergraduate" history on the profile.
     */
    public function getProgrammeChain(int $studentId): array
    {
        $chain   = [];
        $current = $this->find($studentId);
        $seen    = [];
        while ($current && !empty($current['parent_student_id']) && !isset($seen[(int)$current['id']])) {
            $seen[(int)$current['id']] = true;
            $parent = $this->find((int)$current['parent_student_id']);
            if (!$parent) break;
            $chain[]  = $parent;
            $current  = $parent;
        }
        return $chain;
    }

    /**
     * Resolve the student row tied to an authenticated user.
     *
     * Tries `user_id` first (set during enrollment); falls back to a
     * case-insensitive email match so legacy student rows that pre-date the
     * user_id linkage can still be claimed by their owners.
     *
     * Defensive: some legacy DB snapshots predate the migration that adds
     * `student.user_id`. We swallow the missing-column error so the email
     * fallback still runs instead of bubbling a 500 to the portal.
     */
    public function findByUserId(int $userId, ?string $email = null): array|false
    {
        try {
            $row = $this->db->fetchOne(
                "SELECT * FROM `{$this->table}` WHERE `user_id` = ? LIMIT 1",
                [$userId]
            );
            if ($row) {
                return $row;
            }
        } catch (\PDOException $e) {
            // SQLSTATE 42S22 = column not found. Anything else genuinely is
            // an error worth surfacing to the caller.
            if ($e->getCode() !== '42S22') {
                throw $e;
            }
        }

        if ($email !== null && $email !== '') {
            return $this->db->fetchOne(
                "SELECT * FROM `{$this->table}` WHERE LOWER(`email`) = LOWER(?) LIMIT 1",
                [$email]
            );
        }

        return false;
    }
}
