<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Constants\Permissions;

/**
 * Academic Analytics & Reporting Dashboard (Gap 14).
 *
 * Provides aggregated analytics across:
 *  - overview        → KPI summary (students, modules, pass rate, avg pct, attendance)
 *  - grade-distribution → grade counts A–E by year / program / department
 *  - pass-fail-rates    → per-module pass/fail with drill-down by department
 *  - enrollment-trends  → student headcount per academic year + program breakdown
 *  - department-performance → avg percentage, pass rate, modules assessed per dept
 *  - attendance-compliance  → present/absent rates grouped by program/option
 *
 * All endpoints require VIEW_ACADEMIC_ANALYTICS permission.
 * Superadmins bypass the permission check via the hasPerm() helper.
 */
class AcademicAnalyticsController extends BaseController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /* ── Auth helpers ──────────────────────────────────────────────────── */

    private function hasPerm(Request $request, string $slug): bool
    {
        $user = (array)($request->param('_auth_user') ?? []);
        if (($user['role'] ?? '') === 'superadmin') return true;
        return in_array($slug, (array)($user['permissions'] ?? []), true);
    }

    private function gate(Request $request, Response $response): void
    {
        if (!$this->hasPerm($request, Permissions::VIEW_ACADEMIC_ANALYTICS)) {
            $this->error($response, 'Forbidden', 403);
        }
    }

    /* ── Query helpers ─────────────────────────────────────────────────── */

    private function intParam(Request $request, string $key): ?int
    {
        $v = $request->query($key);
        return ($v !== null && $v !== '') ? (int)$v : null;
    }

    /* ── 1. Overview KPIs ──────────────────────────────────────────────── */

    public function overview(Request $request, Response $response): never
    {
        $this->gate($request, $response);

        $yearId = $this->intParam($request, 'academic_year_id');

        // Active students
        $students = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM student WHERE LOWER(student_state) = 'active'"
        )['n'] ?? 0);

        // Module marks aggregates (optionally scoped to an academic year via terms)
        $termWhere = '';
        $termBind  = [];
        if ($yearId !== null) {
            $termWhere = ' AND mm.academic_term_id IN (
                SELECT id FROM academic_terms WHERE academic_year_id = ?
            )';
            $termBind  = [$yearId];
        }

        $marksRow = $this->db->fetchOne("
            SELECT
              COUNT(*) AS total_records,
              SUM(CASE WHEN mm.percentage IS NOT NULL AND mm.percentage >= 50 THEN 1 ELSE 0 END) AS passed,
              SUM(CASE WHEN mm.percentage IS NOT NULL AND mm.percentage <  50 THEN 1 ELSE 0 END) AS failed,
              ROUND(AVG(CASE WHEN mm.percentage IS NOT NULL THEN mm.percentage END), 2) AS avg_pct,
              COUNT(DISTINCT mm.student_regnumber) AS assessed_students,
              COUNT(DISTINCT mm.module_id) AS assessed_modules
            FROM module_marks mm
            WHERE mm.percentage IS NOT NULL
              $termWhere
        ", $termBind) ?: [];

        $totalRecords     = (int)($marksRow['total_records']     ?? 0);
        $passed           = (int)($marksRow['passed']            ?? 0);
        $failed           = (int)($marksRow['failed']            ?? 0);
        $avgPct           = (float)($marksRow['avg_pct']         ?? 0);
        $assessedStudents = (int)($marksRow['assessed_students'] ?? 0);
        $assessedModules  = (int)($marksRow['assessed_modules']  ?? 0);
        $passRate = $totalRecords > 0 ? round($passed / $totalRecords * 100, 1) : 0;

        // Attendance overall
        $attRow = $this->db->fetchOne("
            SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN ar.status = 'absent'  THEN 1 ELSE 0 END) AS absent
            FROM attendance_records ar
        ") ?: [];

        $attTotal   = (int)($attRow['total']   ?? 0);
        $attPresent = (int)($attRow['present'] ?? 0);
        $attRate    = $attTotal > 0 ? round($attPresent / $attTotal * 100, 1) : 0;

        // Modules with submitted marks (distinct)
        $modulesWithMarks = (int)($this->db->fetchOne("
            SELECT COUNT(DISTINCT module_id) AS n FROM module_marks WHERE percentage IS NOT NULL
        ")['n'] ?? 0);

        $this->success($response, [
            'students'           => $students,
            'assessed_students'  => $assessedStudents,
            'assessed_modules'   => $assessedModules,
            'modules_with_marks' => $modulesWithMarks,
            'total_records'      => $totalRecords,
            'passed'             => $passed,
            'failed'             => $failed,
            'pass_rate'          => $passRate,
            'avg_percentage'     => $avgPct,
            'attendance_rate'    => $attRate,
            'attendance_total'   => $attTotal,
        ], 'Overview fetched.');
    }

    /* ── 2. Grade Distribution ─────────────────────────────────────────── */

    public function gradeDistribution(Request $request, Response $response): never
    {
        $this->gate($request, $response);

        $yearId     = $this->intParam($request, 'academic_year_id');
        $optionId   = $this->intParam($request, 'option_id');
        $deptId     = $this->intParam($request, 'department_id');

        $where = ['mm.grade IS NOT NULL'];
        $bind  = [];

        if ($yearId !== null) {
            $where[] = 'mm.academic_term_id IN (SELECT id FROM academic_terms WHERE academic_year_id = ?)';
            $bind[]  = $yearId;
        }
        if ($optionId !== null) {
            $where[] = 'EXISTS (SELECT 1 FROM module_programs mp WHERE mp.module_id = mm.module_id AND mp.option_id = ?)';
            $bind[]  = $optionId;
        }
        if ($deptId !== null) {
            $where[] = 'm.department = ?';
            $bind[]  = $deptId;
        }

        $whereClause = implode(' AND ', $where);

        $rows = $this->db->fetchAll("
            SELECT
              mm.grade,
              COUNT(*) AS count
            FROM module_marks mm
            JOIN modules m ON m.module_id = mm.module_id
            WHERE $whereClause
            GROUP BY mm.grade
            ORDER BY mm.grade
        ", $bind);

        // Normalise: ensure A B C D E all appear even if zero
        $grades = ['A' => 0, 'B' => 0, 'C' => 0, 'D' => 0, 'E' => 0];
        $total  = 0;
        foreach ($rows as $r) {
            $g = strtoupper(trim((string)($r['grade'] ?? '')));
            if (isset($grades[$g])) {
                $grades[$g] += (int)$r['count'];
                $total      += (int)$r['count'];
            }
        }

        $distribution = [];
        foreach ($grades as $g => $count) {
            $distribution[] = [
                'grade'      => $g,
                'count'      => $count,
                'percentage' => $total > 0 ? round($count / $total * 100, 1) : 0,
            ];
        }

        $this->success($response, [
            'distribution' => $distribution,
            'total'        => $total,
        ], 'Grade distribution fetched.');
    }

    /* ── 3. Pass / Fail Rates (by module or by department) ─────────────── */

    public function passFailRates(Request $request, Response $response): never
    {
        $this->gate($request, $response);

        $yearId    = $this->intParam($request, 'academic_year_id');
        $groupBy   = $request->query('group_by') === 'module' ? 'module' : 'department';
        $limit     = min((int)($request->query('limit') ?? 20), 50);

        $where = ['mm.percentage IS NOT NULL'];
        $bind  = [];

        if ($yearId !== null) {
            $where[] = 'mm.academic_term_id IN (SELECT id FROM academic_terms WHERE academic_year_id = ?)';
            $bind[]  = $yearId;
        }

        $whereClause = implode(' AND ', $where);

        if ($groupBy === 'module') {
            $rows = $this->db->fetchAll("
                SELECT
                  m.module_id                  AS id,
                  m.module_code                AS label,
                  m.module_name                AS name,
                  COUNT(*)                     AS total,
                  SUM(CASE WHEN mm.percentage >= 50 THEN 1 ELSE 0 END) AS passed,
                  SUM(CASE WHEN mm.percentage <  50 THEN 1 ELSE 0 END) AS failed,
                  ROUND(AVG(mm.percentage), 2) AS avg_pct
                FROM module_marks mm
                JOIN modules m ON m.module_id = mm.module_id
                WHERE $whereClause
                GROUP BY m.module_id, m.module_code, m.module_name
                ORDER BY total DESC
                LIMIT $limit
            ", $bind);
        } else {
            $rows = $this->db->fetchAll("
                SELECT
                  d.dep_id                     AS id,
                  d.dep_name                   AS label,
                  d.dep_name                   AS name,
                  COUNT(*)                     AS total,
                  SUM(CASE WHEN mm.percentage >= 50 THEN 1 ELSE 0 END) AS passed,
                  SUM(CASE WHEN mm.percentage <  50 THEN 1 ELSE 0 END) AS failed,
                  ROUND(AVG(mm.percentage), 2) AS avg_pct
                FROM module_marks mm
                JOIN modules m ON m.module_id = mm.module_id
                LEFT JOIN departements d ON d.dep_id = m.department
                WHERE $whereClause
                GROUP BY d.dep_id, d.dep_name
                ORDER BY total DESC
                LIMIT $limit
            ", $bind);
        }

        $result = [];
        foreach ($rows as $r) {
            $total  = (int)$r['total'];
            $passed = (int)$r['passed'];
            $failed = (int)$r['failed'];
            $result[] = [
                'id'        => $r['id'],
                'label'     => $r['label'] ?? '',
                'name'      => $r['name'] ?? '',
                'total'     => $total,
                'passed'    => $passed,
                'failed'    => $failed,
                'pass_rate' => $total > 0 ? round($passed / $total * 100, 1) : 0,
                'avg_pct'   => (float)($r['avg_pct'] ?? 0),
            ];
        }

        $this->success($response, [
            'group_by' => $groupBy,
            'rows'     => $result,
        ], 'Pass/fail rates fetched.');
    }

    /* ── 4. Enrollment Trends ──────────────────────────────────────────── */

    public function enrollmentTrends(Request $request, Response $response): never
    {
        $this->gate($request, $response);

        // Students by academic year (acc_year) + category breakdown
        $rows = $this->db->fetchAll("
            SELECT
              s.acc_year                                          AS year_label,
              COUNT(*)                                            AS total,
              SUM(CASE WHEN LOWER(TRIM(s.gender)) IN ('m','male')   THEN 1 ELSE 0 END) AS male,
              SUM(CASE WHEN LOWER(TRIM(s.gender)) IN ('f','female') THEN 1 ELSE 0 END) AS female,
              SUM(CASE WHEN LOWER(TRIM(s.category)) LIKE '%under%'  THEN 1 ELSE 0 END) AS undergraduate,
              SUM(CASE WHEN LOWER(TRIM(s.category)) LIKE '%post%'   THEN 1 ELSE 0 END) AS postgraduate,
              SUM(CASE WHEN LOWER(TRIM(s.category)) LIKE '%master%' THEN 1 ELSE 0 END) AS masters
            FROM student s
            WHERE s.acc_year IS NOT NULL AND s.acc_year != ''
            GROUP BY s.acc_year
            ORDER BY s.acc_year ASC
        ");

        // Program enrollment for current/latest year (top 10 programs)
        $latestYearRow = $this->db->fetchOne("
            SELECT acc_year FROM student WHERE acc_year IS NOT NULL AND acc_year != ''
            ORDER BY id DESC LIMIT 1
        ");
        $latestYear = $latestYearRow['acc_year'] ?? null;

        $programRows = [];
        if ($latestYear !== null) {
            $programRows = $this->db->fetchAll("
                SELECT
                  COALESCE(o.name, 'Unknown') AS program_name,
                  COUNT(*) AS count
                FROM student s
                LEFT JOIN options o ON o.id = CAST(NULLIF(s.std_option,'') AS UNSIGNED)
                WHERE s.acc_year = ?
                GROUP BY o.id, o.name
                ORDER BY count DESC
                LIMIT 10
            ", [$latestYear]);
        }

        $this->success($response, [
            'trends'      => $rows,
            'latest_year' => $latestYear,
            'by_program'  => $programRows,
        ], 'Enrollment trends fetched.');
    }

    /* ── 5. Department Performance ─────────────────────────────────────── */

    public function departmentPerformance(Request $request, Response $response): never
    {
        $this->gate($request, $response);

        $yearId = $this->intParam($request, 'academic_year_id');

        $where = ['mm.percentage IS NOT NULL'];
        $bind  = [];

        if ($yearId !== null) {
            $where[] = 'mm.academic_term_id IN (SELECT id FROM academic_terms WHERE academic_year_id = ?)';
            $bind[]  = $yearId;
        }

        $whereClause = implode(' AND ', $where);

        $rows = $this->db->fetchAll("
            SELECT
              COALESCE(d.dep_name, 'Unassigned')       AS department,
              COUNT(DISTINCT mm.module_id)              AS modules_assessed,
              COUNT(DISTINCT mm.student_regnumber)      AS students_assessed,
              COUNT(*)                                  AS total_records,
              SUM(CASE WHEN mm.percentage >= 50 THEN 1 ELSE 0 END) AS passed,
              ROUND(AVG(mm.percentage), 2)              AS avg_percentage,
              ROUND(MIN(mm.percentage), 2)              AS min_percentage,
              ROUND(MAX(mm.percentage), 2)              AS max_percentage
            FROM module_marks mm
            JOIN modules m ON m.module_id = mm.module_id
            LEFT JOIN departements d ON d.dep_id = m.department
            WHERE $whereClause
            GROUP BY d.dep_id, d.dep_name
            ORDER BY avg_percentage DESC
        ", $bind);

        $result = [];
        foreach ($rows as $r) {
            $total  = (int)($r['total_records'] ?? 0);
            $passed = (int)($r['passed'] ?? 0);
            $result[] = [
                'department'         => $r['department'],
                'modules_assessed'   => (int)($r['modules_assessed']   ?? 0),
                'students_assessed'  => (int)($r['students_assessed']  ?? 0),
                'total_records'      => $total,
                'passed'             => $passed,
                'pass_rate'          => $total > 0 ? round($passed / $total * 100, 1) : 0,
                'avg_percentage'     => (float)($r['avg_percentage']   ?? 0),
                'min_percentage'     => (float)($r['min_percentage']   ?? 0),
                'max_percentage'     => (float)($r['max_percentage']   ?? 0),
            ];
        }

        $this->success($response, [
            'rows' => $result,
        ], 'Department performance fetched.');
    }

    /* ── 6. Attendance Compliance ──────────────────────────────────────── */

    public function attendanceCompliance(Request $request, Response $response): never
    {
        $this->gate($request, $response);

        $yearId = $this->intParam($request, 'academic_year_id');

        // Attendance grouped by program/option
        $yearJoin  = '';
        $yearWhere = '';
        $yearBind  = [];

        if ($yearId !== null) {
            $yearJoin  = "JOIN academic_terms at2 ON at2.id = asess.academic_term_id";
            $yearWhere = "AND at2.academic_year_id = ?";
            $yearBind  = [$yearId];
        }

        $rows = $this->db->fetchAll("
            SELECT
              COALESCE(o.name, 'Unassigned') AS program_name,
              COUNT(ar.id)                           AS total_records,
              SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN ar.status = 'absent'  THEN 1 ELSE 0 END) AS absent,
              SUM(CASE WHEN ar.status = 'late'    THEN 1 ELSE 0 END) AS late,
              SUM(CASE WHEN ar.status = 'excused' THEN 1 ELSE 0 END) AS excused,
              COUNT(DISTINCT asess.module_id)        AS modules_tracked
            FROM attendance_records ar
            JOIN attendance_sessions asess ON asess.id = ar.session_id
            $yearJoin
            JOIN modules m ON m.module_id = asess.module_id
            LEFT JOIN module_programs mp ON mp.module_id = m.module_id
            LEFT JOIN options o ON o.id = mp.option_id
            WHERE 1=1
              $yearWhere
            GROUP BY o.id, o.name
            ORDER BY total_records DESC
        ", $yearBind);

        $result = [];
        foreach ($rows as $r) {
            $total   = (int)($r['total_records'] ?? 0);
            $present = (int)($r['present']       ?? 0);
            $result[] = [
                'program'         => $r['program_name'],
                'total_records'   => $total,
                'present'         => $present,
                'absent'          => (int)($r['absent']   ?? 0),
                'late'            => (int)($r['late']     ?? 0),
                'excused'         => (int)($r['excused']  ?? 0),
                'modules_tracked' => (int)($r['modules_tracked'] ?? 0),
                'attendance_rate' => $total > 0 ? round($present / $total * 100, 1) : 0,
            ];
        }

        // Overall summary
        $overall = $this->db->fetchOne("
            SELECT
              COUNT(*)                                               AS total,
              SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END)  AS present,
              SUM(CASE WHEN status = 'absent'  THEN 1 ELSE 0 END)  AS absent
            FROM attendance_records
        ") ?: [];

        $this->success($response, [
            'rows'    => $result,
            'overall' => [
                'total'           => (int)($overall['total']   ?? 0),
                'present'         => (int)($overall['present'] ?? 0),
                'absent'          => (int)($overall['absent']  ?? 0),
                'attendance_rate' => ($t = (int)($overall['total'] ?? 0)) > 0
                    ? round((int)($overall['present'] ?? 0) / $t * 100, 1) : 0,
            ],
        ], 'Attendance compliance fetched.');
    }
}
