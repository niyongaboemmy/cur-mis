<?php

declare(strict_types=1);

namespace App\Seeders;

use App\Helpers\InstructorDirectory;
use Core\Database;

/**
 * Seeds a realistic, self-consistent teaching workload for the LOCAL DEV DB so
 * the teacher dashboard has something to render.
 *
 * Why this is needed: on a fresh copy of this database `module_assignments`,
 * `module_registrations`, `module_schedules` and `attendance_sessions` are all
 * empty, so every lecturer-scoped query correctly returns nothing and the whole
 * teacher experience is a blank page. The only real course<->student data that
 * exists is `module_marks` (305k legacy rows), so rosters are reconstructed from
 * there.
 *
 * DEV ONLY — this writes teaching assignments and resets lecturer passwords to a
 * known value. It is deliberately NOT a migration: it must never run in
 * production. Run it explicitly:
 *
 *     php scripts/seed.php teacher-demo
 *
 * Fully idempotent — re-running updates in place rather than duplicating.
 */
class TeacherDemoSeeder implements SeederInterface
{
    /** Dev-only password applied to every seeded lecturer account. */
    private const DEV_PASSWORD = 'Teacher@123';

    /**
     * Which modules each lecturer teaches, keyed by users.username.
     * Modules were chosen because they already have 55-60 distinct students in
     * `module_marks`, so the reconstructed rosters are realistically sized.
     */
    private const WORKLOAD = [
        'Christine' => [1067, 1040, 1189],  // Functional Analysis / Molecular Biology / Parasitology
        'PETERO'    => [715, 719],          // Fundamental Theology / Intro to New Testament
    ];

    /**
     * Weekly timetable slot per module:
     *   [day_of_week (1=Mon), start, end, room_id, offsetStartDays, offsetEndDays]
     *
     * The day offsets are relative to today and deliberately spread across the
     * three lifecycle states the My Courses filters expose, so the Ongoing /
     * Upcoming / Completed tabs all have data on a fresh seed:
     *   negative..positive → ongoing      (running now)
     *   both negative      → completed    (already finished)
     *   both positive      → upcoming     (not started yet)
     */
    private const TIMETABLE = [
        1067 => [1, '08:00:00', '10:00:00', 1, -30,  60],  // ongoing
        1040 => [2, '10:00:00', '12:00:00', 2, -20,  70],  // ongoing
        1189 => [4, '14:00:00', '16:00:00', 4, -240, -60], // completed (last term)
        715  => [2, '08:00:00', '10:00:00', 4, -30,  60],  // ongoing
        719  => [5, '10:00:00', '12:00:00', 1,  30, 150],  // upcoming (next term)
    ];

    public static function run(): array
    {
        $db  = Database::getInstance();
        $log = [];

        // ── Resolve the target term ──────────────────────────────────────────
        $term = $db->fetchOne(
            "SELECT id, academic_year_id, label FROM `academic_terms`
             WHERE is_current = 1 ORDER BY id ASC LIMIT 1"
        );
        if (!$term) {
            $term = $db->fetchOne("SELECT id, academic_year_id, label FROM `academic_terms` ORDER BY id ASC LIMIT 1");
        }
        if (!$term) {
            return ['ABORTED: no academic_terms rows exist — cannot seed a teaching workload.'];
        }
        $termId = (int)$term['id'];
        $yearId = (int)$term['academic_year_id'];
        $log[] = "Target term: #{$termId} \"{$term['label']}\" (academic_year_id={$yearId}).";

        // Password hash is computed once and reused for every seeded lecturer.
        $hash = password_hash(self::DEV_PASSWORD, PASSWORD_BCRYPT);

        $totalAssignments = 0;
        $totalRoster      = 0;
        $totalOfferings   = 0;
        $totalExams       = 0;

        foreach (self::WORKLOAD as $username => $moduleIds) {
            $user = $db->fetchOne(
                "SELECT id, username, full_name FROM `users` WHERE username = ? LIMIT 1",
                [$username]
            );
            if (!$user) {
                $log[] = "SKIPPED: no user with username \"{$username}\".";
                continue;
            }
            $userId  = (int)$user['id'];
            $staffId = InstructorDirectory::USER_OFFSET + $userId;

            // ── Known dev password so the account can actually be logged into ─
            $db->execute(
                "UPDATE `users` SET `password` = ?, `must_change_pw` = 0, `is_active` = 1 WHERE `id` = ?",
                [$hash, $userId]
            );
            $log[] = "User #{$userId} {$user['full_name']} ({$username}) — password set to \"" . self::DEV_PASSWORD . '".';

            foreach ($moduleIds as $moduleId) {
                $module = $db->fetchOne(
                    "SELECT module_id, module_code, module_name FROM `modules` WHERE module_id = ? LIMIT 1",
                    [$moduleId]
                );
                if (!$module) {
                    $log[] = "  SKIPPED module #{$moduleId} — not in `modules`.";
                    continue;
                }

                // ── Assignment. staff_id carries the namespaced instructor id so
                //    the legacy readers keep working; user_id is the canonical
                //    link that migration 118 established.
                $db->execute(
                    "INSERT INTO `module_assignments`
                        (module_id, staff_id, user_id, academic_year_id, academic_term_id, role, hours_per_week)
                     VALUES (?,?,?,?,?, 'primary', 3.0)
                     ON DUPLICATE KEY UPDATE
                        `user_id`          = VALUES(`user_id`),
                        `academic_year_id` = VALUES(`academic_year_id`),
                        `role`             = VALUES(`role`),
                        `hours_per_week`   = VALUES(`hours_per_week`)",
                    [$moduleId, $staffId, $userId, $yearId, $termId]
                );
                $totalAssignments++;

                // ── Roster, reconstructed from module_marks. Restricted to reg
                //    numbers that actually exist in `student` so no orphan rows
                //    are created (marks contain ~5% stale regnumbers).
                $inserted = $db->execute(
                    "INSERT INTO `module_registrations`
                        (module_id, student_regnumber, academic_term_id, status)
                     SELECT DISTINCT mm.module_id, mm.student_regnumber, ?, 'registered'
                     FROM `module_marks` mm
                     JOIN `student` s ON s.regnumber = mm.student_regnumber
                     WHERE mm.module_id = ?
                     ON DUPLICATE KEY UPDATE `status` = 'registered'",
                    [$termId, $moduleId]
                );
                $totalRoster += $inserted;

                // ── Weekly timetable block (drives the teacher calendar) ──────
                if (isset(self::TIMETABLE[$moduleId])) {
                    [$dow, $start, $end, $roomId, $offStart, $offEnd] = self::TIMETABLE[$moduleId];
                    $exists = $db->fetchOne(
                        "SELECT id FROM `module_schedules`
                         WHERE module_id = ? AND academic_term_id = ? AND day_of_week = ? LIMIT 1",
                        [$moduleId, $termId, $dow]
                    );
                    if ($exists) {
                        // Keep the window in step with today's date on a re-run,
                        // so the lifecycle tabs stay populated over time.
                        $db->execute(
                            "UPDATE `module_schedules`
                                SET start_date = DATE_ADD(CURDATE(), INTERVAL ? DAY),
                                    end_date   = DATE_ADD(CURDATE(), INTERVAL ? DAY)
                              WHERE id = ?",
                            [$offStart, $offEnd, (int)$exists['id']]
                        );
                    } else {
                        $db->execute(
                            "INSERT INTO `module_schedules`
                                (module_id, academic_term_id, day_of_week, start_time, end_time,
                                 room_id, session_type, start_date, end_date)
                             VALUES (?,?,?,?,?,?, 'lecture',
                                     DATE_ADD(CURDATE(), INTERVAL ? DAY),
                                     DATE_ADD(CURDATE(), INTERVAL ? DAY))",
                            [$moduleId, $termId, $dow, $start, $end, $roomId, $offStart, $offEnd]
                        );
                        $totalOfferings++;
                    }
                }

                // ── Offering row. `module_offerings` is a SEPARATE table from
                //    `module_schedules`: the Marks page's schedule picker and
                //    AttendanceController::listScheduledBlocks read offerings,
                //    while the teacher calendar reads schedules. Both need rows
                //    or those pickers come up empty for the lecturer.
                //    `instructor_id` uses the namespaced InstructorDirectory id.
                if (isset(self::TIMETABLE[$moduleId])) {
                    [$dow, $start, $end, , $offStart, $offEnd] = self::TIMETABLE[$moduleId];
                    $offExists = $db->fetchOne(
                        "SELECT id FROM `module_offerings` WHERE module_id = ? AND instructor_id = ? LIMIT 1",
                        [$moduleId, $staffId]
                    );
                    if (!$offExists) {
                        // option_id is NOT NULL. Prefer the module's real
                        // programme mapping; fall back to the first option so a
                        // module with no module_programs row can still be offered.
                        $optRow = $db->fetchOne(
                            "SELECT option_id FROM `module_programs` WHERE module_id = ? ORDER BY option_id ASC LIMIT 1",
                            [$moduleId]
                        ) ?: $db->fetchOne("SELECT id AS option_id FROM `options` ORDER BY id ASC LIMIT 1");
                        $optionId = (int)($optRow['option_id'] ?? 0);

                        if ($optionId > 0) {
                            $db->execute(
                                "INSERT INTO `module_offerings`
                                    (module_id, option_id, `mode`, semesters, start_date, end_date,
                                     day_of_week, day_pattern, start_time, end_time,
                                     instructor_id, instructor_name, activity, year_of_study)
                                 VALUES (?, ?, 'Day', 'S1',
                                         DATE_ADD(CURDATE(), INTERVAL ? DAY),
                                         DATE_ADD(CURDATE(), INTERVAL ? DAY),
                                         ?, ?, ?, ?, ?, ?, 'Teaching', 1)",
                                [$moduleId, $optionId, $offStart, $offEnd, $dow, (string)$dow,
                                 $start, $end, $staffId, (string)$user['full_name']]
                            );
                            $totalOfferings++;
                        }
                    }
                }

                // ── One final exam per module, in the exam hall, invigilated by
                //    this lecturer, so "my assigned exam room" has data.
                $examExists = $db->fetchOne(
                    "SELECT id FROM `exam_schedules` WHERE module_id = ? AND term_id = ? LIMIT 1",
                    [$moduleId, $termId]
                );
                if (!$examExists) {
                    $db->execute(
                        "INSERT INTO `exam_schedules`
                            (module_id, term_id, component, exam_date, start_time, end_time,
                             room_id, instructor_name, invigilator_user_id, notes)
                         VALUES (?,?, 'Final Exam', DATE_ADD(CURDATE(), INTERVAL 14 DAY), '09:00:00', '12:00:00',
                                 3, ?, ?, 'Seeded by teacher-demo')",
                        [$moduleId, $termId, (string)$user['full_name'], $userId]
                    );
                    $totalExams++;
                }

                $log[] = "  {$module['module_code']} — {$module['module_name']}: assigned, enrollment + timetable + exam seeded.";
            }
        }

        $log[] = '';
        $log[] = "Assignments upserted: {$totalAssignments}";
        $log[] = "Roster rows written:  {$totalRoster}";
        $log[] = "Timetable blocks:     {$totalOfferings}";
        $log[] = "Exam schedules:       {$totalExams}";

        return $log;
    }
}
