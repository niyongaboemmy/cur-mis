<?php

declare(strict_types=1);

namespace App\Models;

class ModuleScheduleModel extends BaseModel
{
    protected string $table = 'module_schedules';
    protected array $fillable = [
        'module_id', 'module_assignment_id', 'academic_term_id', 'room_id',
        'day_of_week', 'start_time', 'end_time', 'session_type', 'notes',
    ];

    /**
     * Join schedules with module + room + staff context for UI display.
     *
     * @param array{term_id?:int,module_id?:int,room_id?:int,staff_id?:int} $filters
     */
    public function listWithJoins(array $filters = []): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['term_id'])) {
            $where[]    = 'ms.academic_term_id = ?';
            $bindings[] = (int)$filters['term_id'];
        }
        if (!empty($filters['module_id'])) {
            $where[]    = 'ms.module_id = ?';
            $bindings[] = (int)$filters['module_id'];
        }
        if (!empty($filters['room_id'])) {
            $where[]    = 'ms.room_id = ?';
            $bindings[] = (int)$filters['room_id'];
        }
        if (!empty($filters['staff_id'])) {
            $where[]    = 'ma.staff_id = ?';
            $bindings[] = (int)$filters['staff_id'];
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        return $this->db->fetchAll(
            "SELECT ms.*,
                    m.module_code, m.module_name,
                    r.name AS room_name,
                    ma.staff_id,
                    e.full_name AS staff_name
             FROM `module_schedules` ms
             JOIN `modules` m ON m.module_id = ms.module_id
             JOIN `rooms` r   ON r.id = ms.room_id
             LEFT JOIN `module_assignments` ma ON ma.id = ms.module_assignment_id
             LEFT JOIN `hr_employees` e        ON e.id = ma.staff_id
             {$whereSql}
             ORDER BY ms.day_of_week ASC, ms.start_time ASC",
            $bindings
        );
    }

    /**
     * Detect room + faculty conflicts for a candidate schedule.
     *
     * A conflict occurs when two entries overlap in time on the same day & term,
     * sharing either the same room OR the same faculty member (via assignment).
     *
     * Time overlap: `NOT (existing.end_time <= candidate.start_time OR existing.start_time >= candidate.end_time)`
     *
     * @param array $data   schedule draft ($fillable keys)
     * @param ?int  $ignoreId schedule id to exclude (used on update)
     * @return array<int,array{type:string,conflict_with:array}>
     */
    public function detectConflicts(array $data, ?int $ignoreId = null): array
    {
        $conflicts = [];

        $required = ['room_id', 'academic_term_id', 'day_of_week', 'start_time', 'end_time'];
        foreach ($required as $k) {
            if (!isset($data[$k]) || $data[$k] === '') {
                return [];
            }
        }

        $ignoreClause = $ignoreId !== null ? ' AND ms.id <> ?' : '';

        // Room conflict
        $roomBind = [
            (int)$data['room_id'],
            (int)$data['academic_term_id'],
            (int)$data['day_of_week'],
            (string)$data['start_time'],
            (string)$data['end_time'],
        ];
        if ($ignoreId !== null) {
            $roomBind[] = $ignoreId;
        }
        $roomRows = $this->db->fetchAll(
            "SELECT ms.*, m.module_code, m.module_name, r.name AS room_name
             FROM `module_schedules` ms
             JOIN `modules` m ON m.module_id = ms.module_id
             JOIN `rooms` r   ON r.id = ms.room_id
             WHERE ms.room_id = ?
               AND ms.academic_term_id = ?
               AND ms.day_of_week = ?
               AND NOT (ms.end_time <= ? OR ms.start_time >= ?)
               {$ignoreClause}",
            $roomBind
        );
        foreach ($roomRows as $r) {
            $conflicts[] = ['type' => 'room', 'conflict_with' => $r];
        }

        // Faculty conflict (requires module_assignment_id → staff_id)
        if (!empty($data['module_assignment_id'])) {
            $asgn = (new ModuleAssignmentModel())->find((int)$data['module_assignment_id']);
            if ($asgn && !empty($asgn['staff_id'])) {
                $facBind = [
                    (int)$asgn['staff_id'],
                    (int)$data['academic_term_id'],
                    (int)$data['day_of_week'],
                    (string)$data['start_time'],
                    (string)$data['end_time'],
                ];
                if ($ignoreId !== null) {
                    $facBind[] = $ignoreId;
                }
                $facRows = $this->db->fetchAll(
                    "SELECT ms.*, m.module_code, m.module_name,
                            ma.staff_id, e.full_name AS staff_name
                     FROM `module_schedules` ms
                     JOIN `module_assignments` ma ON ma.id = ms.module_assignment_id
                     JOIN `modules` m             ON m.module_id = ms.module_id
                     LEFT JOIN `hr_employees` e   ON e.id = ma.staff_id
                     WHERE ma.staff_id = ?
                       AND ms.academic_term_id = ?
                       AND ms.day_of_week = ?
                       AND NOT (ms.end_time <= ? OR ms.start_time >= ?)
                       {$ignoreClause}",
                    $facBind
                );
                foreach ($facRows as $r) {
                    $conflicts[] = ['type' => 'faculty', 'conflict_with' => $r];
                }
            }
        }

        return $conflicts;
    }

    /**
     * Returns schedule entries a student already has (via module_registrations)
     * for a given term. Used to detect clashes when self-registering for a new module.
     */
    public function studentSchedulesFor(string $regnumber, int $termId): array
    {
        return $this->db->fetchAll(
            "SELECT ms.day_of_week, ms.start_time, ms.end_time, ms.module_id
             FROM `module_schedules` ms
             JOIN `module_registrations` mr
                   ON mr.module_id = ms.module_id AND mr.academic_term_id = ms.academic_term_id
             WHERE mr.student_regnumber = ?
               AND mr.academic_term_id = ?
               AND mr.status = 'registered'",
            [$regnumber, $termId]
        );
    }
}
