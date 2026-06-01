<?php

declare(strict_types=1);

namespace App\Models;

class GateLogModel extends BaseModel
{
    protected string $table = 'gate_logs';
    protected array $fillable = [
        'student_id', 'staff_id', 'scan_type', 'barcode',
        'gate', 'result', 'reason', 'notes', 'verified_by',
    ];

    /**
     * Paginated list with student and verifier details joined.
     *
     * @param array{student_id?:string,result?:string,scan_type?:string,gate?:string,date_from?:string,date_to?:string,search?:string} $filters
     */
    public function listWithDetails(array $filters = [], int $page = 1, int $perPage = 50): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['student_id'])) {
            $where[]    = 'gl.student_id = ?';
            $bindings[] = $filters['student_id'];
        }
        if (!empty($filters['result'])) {
            $where[]    = 'gl.result = ?';
            $bindings[] = $filters['result'];
        }
        if (!empty($filters['scan_type'])) {
            $where[]    = 'gl.scan_type = ?';
            $bindings[] = $filters['scan_type'];
        }
        if (!empty($filters['gate'])) {
            $where[]    = 'gl.gate = ?';
            $bindings[] = $filters['gate'];
        }
        if (!empty($filters['date_from'])) {
            $where[]    = 'DATE(gl.created_at) >= ?';
            $bindings[] = $filters['date_from'];
        }
        if (!empty($filters['date_to'])) {
            $where[]    = 'DATE(gl.created_at) <= ?';
            $bindings[] = $filters['date_to'];
        }
        if (!empty($filters['search'])) {
            $where[]    = '(s.fname LIKE ? OR s.lname LIKE ? OR gl.student_id LIKE ?)';
            $term       = '%' . $filters['search'] . '%';
            $bindings   = array_merge($bindings, [$term, $term, $term]);
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
        $offset   = ($page - 1) * $perPage;

        $countRow = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt
             FROM `gate_logs` gl
             LEFT JOIN `student` s ON s.regnumber = gl.student_id
             {$whereSql}",
            $bindings
        );
        $total = (int)($countRow['cnt'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT gl.*,
                    CONCAT(s.fname, ' ', s.lname) AS student_name,
                    s.email                        AS student_email,
                    u.full_name                    AS verified_by_name
             FROM `gate_logs` gl
             LEFT JOIN `student` s ON s.regnumber = gl.student_id
             LEFT JOIN `users`   u ON u.id = gl.verified_by
             {$whereSql}
             ORDER BY gl.created_at DESC
             LIMIT {$perPage} OFFSET {$offset}",
            $bindings
        );

        return [
            'data'      => $rows,
            'total'     => $total,
            'page'      => $page,
            'per_page'  => $perPage,
            'last_page' => (int)ceil($total / $perPage),
        ];
    }

    /**
     * Today's stats per gate and overall.
     */
    public function getTodayStats(?string $gate = null): array
    {
        $gateWhere    = $gate ? "AND gate = ?" : "";
        $gateBindings = $gate ? [$gate] : [];

        $row = $this->db->fetchOne(
            "SELECT
                COUNT(*) AS total,
                SUM(result = 'granted') AS granted,
                SUM(result = 'denied')  AS denied,
                SUM(scan_type = 'student_id')   AS by_student_id,
                SUM(scan_type = 'receipt')       AS by_receipt,
                SUM(scan_type = 'registration')  AS by_registration
             FROM `gate_logs`
             WHERE DATE(created_at) = CURDATE()
             {$gateWhere}",
            $gateBindings
        );

        return [
            'total'           => (int)($row['total']          ?? 0),
            'granted'         => (int)($row['granted']        ?? 0),
            'denied'          => (int)($row['denied']         ?? 0),
            'by_student_id'   => (int)($row['by_student_id']  ?? 0),
            'by_receipt'      => (int)($row['by_receipt']     ?? 0),
            'by_registration' => (int)($row['by_registration'] ?? 0),
        ];
    }

    /**
     * Latest N log entries (for the live feed widget).
     */
    public function getRecentLogs(int $limit = 20, ?string $gate = null): array
    {
        $gateWhere    = $gate ? "AND gl.gate = ?" : "";
        $gateBindings = $gate ? [$gate] : [];

        return $this->db->fetchAll(
            "SELECT gl.*,
                    CONCAT(s.fname, ' ', s.lname) AS student_name,
                    u.full_name AS verified_by_name
             FROM `gate_logs` gl
             LEFT JOIN `student` s ON s.regnumber = gl.student_id
             LEFT JOIN `users`   u ON u.id = gl.verified_by
             WHERE 1=1 {$gateWhere}
             ORDER BY gl.created_at DESC
             LIMIT {$limit}",
            $gateBindings
        );
    }
}
