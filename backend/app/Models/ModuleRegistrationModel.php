<?php

declare(strict_types=1);

namespace App\Models;

class ModuleRegistrationModel extends BaseModel
{
    protected string $table = 'module_registrations';
    protected array $fillable = [
        'module_id', 'student_regnumber', 'academic_term_id',
        'status', 'grade', 'registered_at', 'dropped_at',
    ];

    /**
     * @param array{term_id?:int,module_id?:int,regnumber?:string,status?:string} $filters
     */
    public function listWithJoins(array $filters = []): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['term_id'])) {
            $where[]    = 'mr.academic_term_id = ?';
            $bindings[] = (int)$filters['term_id'];
        }
        if (!empty($filters['module_id'])) {
            $where[]    = 'mr.module_id = ?';
            $bindings[] = (int)$filters['module_id'];
        }
        if (!empty($filters['regnumber'])) {
            $where[]    = 'mr.student_regnumber = ?';
            $bindings[] = (string)$filters['regnumber'];
        }
        if (!empty($filters['status'])) {
            $where[]    = 'mr.status = ?';
            $bindings[] = (string)$filters['status'];
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        return $this->db->fetchAll(
            "SELECT mr.*,
                    m.module_code, m.module_name, m.module_credits,
                    s.id            AS student_id,
                    s.fname         AS student_fname,
                    s.lname         AS student_lname,
                    s.std_option    AS student_std_option,
                    s.current_level AS student_current_level,
                    s.intake        AS student_intake,
                    o.name          AS student_program_name,
                    o.code          AS student_program_code,
                    t.label         AS term_label
             FROM `module_registrations` mr
             JOIN `modules` m            ON m.module_id = mr.module_id
             LEFT JOIN `student` s       ON s.regnumber = mr.student_regnumber
             LEFT JOIN `options` o       ON o.id        = CAST(NULLIF(s.std_option, '') AS UNSIGNED)
             LEFT JOIN `academic_terms` t ON t.id       = mr.academic_term_id
             {$whereSql}
             ORDER BY mr.registered_at DESC",
            $bindings
        );
    }

    public function isRegistered(string $regnumber, int $moduleId, int $termId): bool
    {
        $row = $this->db->fetchOne(
            "SELECT id FROM `module_registrations`
             WHERE student_regnumber = ? AND module_id = ? AND academic_term_id = ?
             LIMIT 1",
            [$regnumber, $moduleId, $termId]
        );
        return (bool)$row;
    }

    /** @return int[] */
    public function completedModuleIds(string $regnumber): array
    {
        $rows = $this->db->fetchAll(
            "SELECT DISTINCT module_id FROM `module_registrations`
             WHERE student_regnumber = ? AND status = 'completed'",
            [$regnumber]
        );
        return array_map(static fn ($r) => (int)$r['module_id'], $rows);
    }
}
