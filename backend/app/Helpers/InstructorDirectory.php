<?php

declare(strict_types=1);

namespace App\Helpers;

use Core\Database;

/**
 * Unifies the two lecturer pools — HR employees (`hr_employees`) and staff user
 * accounts (`users`, i.e. anyone who isn't a student/applicant) — behind one
 * integer id space, so a single int column can reference either:
 *   • `module_offerings.instructor_id`  (Scheduling tab)
 *   • `module_assignments.staff_id`     (Modules → Schedule page)
 *
 * User ids are namespaced by USER_OFFSET so they never collide with employee
 * ids:
 *   employee → its own `hr_employees.id`   (< USER_OFFSET)
 *   user     → USER_OFFSET + `users.id`    (>= USER_OFFSET)
 */
final class InstructorDirectory
{
    /** Namespacing offset for user-account lecturer ids. */
    public const USER_OFFSET = 1000000;

    public static function isUser(int $id): bool
    {
        return $id >= self::USER_OFFSET;
    }

    /** Recover the underlying `users.id` from a namespaced instructor id. */
    public static function userId(int $id): int
    {
        return $id - self::USER_OFFSET;
    }

    /**
     * The unified, name-sorted lecturer list. Each row:
     *   ['id' => int, 'full_name' => string, 'position' => string, 'source' => 'employee'|'user']
     * A user already represented as an HR employee (same email) is skipped.
     */
    public static function all(Database $db): array
    {
        $emps = $db->fetchAll(
            "SELECT id, full_name, position, email
             FROM `hr_employees`
             WHERE `full_name` IS NOT NULL AND `full_name` <> ''
             ORDER BY `full_name` ASC",
        );
        $users = $db->fetchAll(
            "SELECT u.id, u.full_name, u.email, r.name AS role_name
             FROM `users` u
             JOIN `roles` r ON r.id = u.role_id
             WHERE r.name NOT IN ('student', 'applicant')
               AND u.full_name IS NOT NULL AND u.full_name <> ''
             ORDER BY u.full_name ASC",
        );

        $out  = [];
        $seen = [];
        foreach ($emps as $r) {
            $email = strtolower(trim((string)($r['email'] ?? '')));
            if ($email !== '') $seen[$email] = true;
            $out[] = [
                'id'        => (int)$r['id'],
                'full_name' => (string)$r['full_name'],
                'position'  => $r['position'] ?: 'Staff',
                'source'    => 'employee',
            ];
        }
        foreach ($users as $u) {
            $email = strtolower(trim((string)($u['email'] ?? '')));
            if ($email !== '' && isset($seen[$email])) continue; // already an employee
            $out[] = [
                'id'        => self::USER_OFFSET + (int)$u['id'],
                'full_name' => (string)$u['full_name'],
                'position'  => $u['role_name'] ? ucwords((string)$u['role_name']) : 'Staff',
                'source'    => 'user',
            ];
        }

        usort($out, static fn ($a, $b) => strcasecmp($a['full_name'], $b['full_name']));
        return $out;
    }

    /**
     * Display name for a namespaced instructor id, for denormalising onto a
     * row's *_name column. Null when the id resolves to nothing.
     */
    public static function resolveName(Database $db, ?int $id): ?string
    {
        if ($id === null || $id <= 0) return null;
        if (self::isUser($id)) {
            $row = $db->fetchOne("SELECT full_name FROM `users` WHERE id = ?", [self::userId($id)]);
        } else {
            $row = $db->fetchOne("SELECT full_name FROM `hr_employees` WHERE id = ?", [$id]);
        }
        $name = trim((string)(($row['full_name'] ?? '') ?: ''));
        return $name === '' ? null : $name;
    }
}
