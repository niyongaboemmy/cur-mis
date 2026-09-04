<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;

/**
 * Institutional timetable.
 *
 * VIEW_TIMETABLE and MANAGE_TIMETABLE existed in the permission catalogue
 * without a single route, controller or page behind them — granting either
 * one did nothing. The schedule data they describe has been in
 * `module_schedules` all along (module, assignment, term, room, day, times,
 * session type); what was missing was a read surface over it that is not the
 * per-module scheduling editor.
 *
 * Writes deliberately stay on the existing /api/modules/schedules endpoints so
 * there is exactly one place that validates and conflict-checks a schedule;
 * MANAGE_TIMETABLE is accepted there alongside MANAGE_MODULE_SCHEDULES.
 *
 * The legacy `timetable` table is NOT read here. `module_schedules` is what
 * the Scheduling panel writes and is the source of truth.
 */
class TimetableController extends BaseController
{
    /** Monday = 1 … Sunday = 7, matching `module_schedules.day_of_week`. */
    private const DAY_NAMES = [
        1 => 'Monday',
        2 => 'Tuesday',
        3 => 'Wednesday',
        4 => 'Thursday',
        5 => 'Friday',
        6 => 'Saturday',
        7 => 'Sunday',
    ];

    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    // ── GET /api/timetable ────────────────────────────────────────────────────
    /**
     * Every scheduled session for a term, with the filter options needed to
     * narrow it. Query: term_id, option_id, level_id, room_id, staff_id.
     */
    public function index(Request $request, Response $response): never
    {
        $termId   = (int) ($request->query('term_id')   ?? 0);
        $optionId = (int) ($request->query('option_id') ?? 0);
        $levelId  = (int) ($request->query('level_id')  ?? 0);
        $roomId   = (int) ($request->query('room_id')   ?? 0);
        $staffId  = (int) ($request->query('staff_id')  ?? 0);

        // Default to the active term so the page opens on something useful
        // rather than the whole history of every term ever scheduled.
        if ($termId <= 0) {
            $termId = (int) (\App\Helpers\AcademicContext::termId() ?? 0);
        }

        $where    = [];
        $bindings = [];

        if ($termId > 0) {
            $where[]    = 'ms.academic_term_id = ?';
            $bindings[] = $termId;
        }
        if ($roomId > 0) {
            $where[]    = 'ms.room_id = ?';
            $bindings[] = $roomId;
        }
        if ($staffId > 0) {
            $where[]    = 'ma.staff_id = ?';
            $bindings[] = $staffId;
        }
        if ($optionId > 0) {
            $where[]    = 'EXISTS (SELECT 1 FROM `module_programs` mp WHERE mp.module_id = ms.module_id AND mp.option_id = ?)';
            $bindings[] = $optionId;
        }
        if ($levelId > 0) {
            $where[]    = 'EXISTS (SELECT 1 FROM `module_levels` ml WHERE ml.module_id = ms.module_id AND ml.level_id = ?)';
            $bindings[] = $levelId;
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        $rows = $this->db->fetchAll(
            "SELECT ms.id,
                    ms.module_id,
                    ms.academic_term_id,
                    ms.room_id,
                    ms.day_of_week,
                    ms.start_time,
                    ms.end_time,
                    ms.session_type,
                    ms.notes,
                    m.module_code,
                    m.module_name,
                    r.name       AS room_name,
                    ma.staff_id,
                    e.full_name  AS staff_name
               FROM `module_schedules` ms
               JOIN `modules` m ON m.module_id = ms.module_id
               JOIN `rooms` r   ON r.id = ms.room_id
               LEFT JOIN `module_assignments` ma ON ma.id = ms.module_assignment_id
               LEFT JOIN `hr_employees` e        ON e.id = ma.staff_id
               {$whereSql}
              ORDER BY ms.day_of_week ASC, ms.start_time ASC, m.module_code ASC",
            $bindings
        );

        foreach ($rows as &$row) {
            $row['day_name'] = self::DAY_NAMES[(int) $row['day_of_week']] ?? '';
        }
        unset($row);

        $this->success($response, [
            'entries'  => $rows,
            'term_id'  => $termId ?: null,
            'days'     => self::DAY_NAMES,
            'clashes'  => $this->detectClashes($rows),
            'filters'  => $this->filterOptions(),
        ], 'Timetable fetched.');
    }

    /**
     * Room and lecturer double-bookings inside the returned set.
     *
     * Reported per entry id so the grid can flag the specific cells rather
     * than showing a separate list the reader has to cross-reference. Computed
     * in PHP over the already-fetched rows — the set is one term's sessions,
     * a few hundred at most, so a second round trip would buy nothing.
     *
     * @param  array $rows
     * @return array<int, string[]>  entry id => human-readable clash reasons
     */
    private function detectClashes(array $rows): array
    {
        $clashes = [];

        $count = count($rows);
        for ($i = 0; $i < $count; $i++) {
            for ($j = $i + 1; $j < $count; $j++) {
                $a = $rows[$i];
                $b = $rows[$j];

                if ((int) $a['day_of_week'] !== (int) $b['day_of_week']) {
                    continue;
                }
                // Half-open comparison: a session ending exactly when the next
                // starts is back-to-back, not a clash.
                if (!($a['start_time'] < $b['end_time'] && $b['start_time'] < $a['end_time'])) {
                    continue;
                }

                if ((int) $a['room_id'] === (int) $b['room_id']) {
                    $clashes[(int) $a['id']][] = "Room {$a['room_name']} is double-booked with {$b['module_code']}.";
                    $clashes[(int) $b['id']][] = "Room {$b['room_name']} is double-booked with {$a['module_code']}.";
                }

                if (!empty($a['staff_id']) && (int) $a['staff_id'] === (int) $b['staff_id']) {
                    $clashes[(int) $a['id']][] = "{$a['staff_name']} is also teaching {$b['module_code']}.";
                    $clashes[(int) $b['id']][] = "{$b['staff_name']} is also teaching {$a['module_code']}.";
                }
            }
        }

        return $clashes;
    }

    /** Values for the term / programme / level / room / lecturer pickers. */
    private function filterOptions(): array
    {
        return [
            'terms' => $this->db->fetchAll(
                "SELECT t.id, t.label, t.is_current, y.label AS year_label
                   FROM `academic_terms` t
                   LEFT JOIN `academic_years` y ON y.id = t.academic_year_id
                  ORDER BY t.id DESC"
            ),
            'options' => $this->db->fetchAll(
                "SELECT id, name FROM `options` ORDER BY name ASC"
            ),
            'levels' => $this->db->fetchAll(
                "SELECT id, name FROM `levels` ORDER BY id ASC"
            ),
            'rooms' => $this->db->fetchAll(
                "SELECT id, name FROM `rooms` ORDER BY name ASC"
            ),
            'staff' => $this->db->fetchAll(
                "SELECT DISTINCT e.id, e.full_name
                   FROM `module_assignments` ma
                   JOIN `hr_employees` e ON e.id = ma.staff_id
                  ORDER BY e.full_name ASC"
            ),
        ];
    }
}
