<?php

declare(strict_types=1);

namespace App\Models;

class StudentModel extends BaseModel
{
    // Point to student table, though students view is available for read-only
    protected string $table = 'student';
    protected array $fillable = [
        'user_id',
        'regnumber', 'fname', 'lname', 'phone', 'email', 'gender',
        'birthdate', 'nationality', 'program', 'std_option', 'faculty',
        'department', 'current_level', 'registration_date', 'student_state',
        'intake', 'acc_year', 'combination', 'last_school', 'sponsor'
    ];

    /**
     * Resolve the student row tied to an authenticated user.
     *
     * Tries `user_id` first (set during enrollment); falls back to a
     * case-insensitive email match so legacy student rows that pre-date the
     * user_id linkage can still be claimed by their owners.
     */
    public function findByUserId(int $userId, ?string $email = null): array|false
    {
        $row = $this->db->fetchOne(
            "SELECT * FROM `{$this->table}` WHERE `user_id` = ? LIMIT 1",
            [$userId]
        );

        if ($row) {
            return $row;
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
