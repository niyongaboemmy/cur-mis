<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;

class AdminDashboardController extends BaseController
{
    public function overview(Request $request, Response $response): never
    {
        $db = Database::getInstance();

        // ── ACTIVE-only student aggregates ─────────────────────────────────
        // Departments that begin with "Master" → Masters track; "Post Graduate"
        // / "PGDE" / "%postgraduate%" → Postgraduate diploma; everything else
        // is treated as Undergraduate.
        $levelCase = "
            CASE
              WHEN d.dep_name LIKE 'Master%' THEN 'masters'
              WHEN d.dep_name LIKE 'Post Graduate%'
                OR d.dep_name LIKE 'PGDE%'
                OR d.dep_name LIKE '%postgraduate%' THEN 'postgraduate'
              ELSE 'undergraduate'
            END
        ";

        $levelRow = $db->fetchOne("
            SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN $levelCase = 'undergraduate' THEN 1 ELSE 0 END) AS undergraduate,
              SUM(CASE WHEN $levelCase = 'postgraduate'  THEN 1 ELSE 0 END) AS postgraduate,
              SUM(CASE WHEN $levelCase = 'masters'       THEN 1 ELSE 0 END) AS masters
            FROM student s
            LEFT JOIN departements d ON d.dep_id = CAST(NULLIF(s.department,'') AS UNSIGNED)
            WHERE LOWER(s.student_state) = 'active'
        ") ?: [];

        $studentsTotal = (int)($levelRow['total'] ?? 0);

        $genderRow = $db->fetchOne("
            SELECT
              SUM(CASE WHEN LOWER(TRIM(gender)) IN ('m','male')   THEN 1 ELSE 0 END) AS male,
              SUM(CASE WHEN LOWER(TRIM(gender)) IN ('f','female') THEN 1 ELSE 0 END) AS female,
              SUM(CASE WHEN gender IS NULL OR TRIM(gender) = ''
                        OR LOWER(TRIM(gender)) NOT IN ('m','male','f','female')
                        THEN 1 ELSE 0 END) AS unknown
            FROM student
            WHERE LOWER(student_state) = 'active'
        ") ?: [];

        $employeesTotal = (int)($db->fetchOne("SELECT COUNT(*) AS n FROM employees")['n'] ?? 0);
        $applicantsTotal = (int)($db->fetchOne("SELECT COUNT(*) AS n FROM student_applications WHERE status <> 'draft'")['n'] ?? 0);
        $revenueTotal = (float)($db->fetchOne("SELECT COALESCE(SUM(amount),0) AS s FROM fee_payments WHERE status = 'confirmed'")['s'] ?? 0);

        // Last-7-days line chart: applications submitted vs new student registrations.
        // Build a 7-element array indexed by weekday (Mon..Sun).
        $apps7 = $db->fetchAll("
            SELECT DATE(created_at) AS d, COUNT(*) AS n
            FROM student_applications
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
              AND status <> 'draft'
            GROUP BY DATE(created_at)
        ");
        $regs7 = $db->fetchAll("
            SELECT DATE(registration_date) AS d, COUNT(*) AS n
            FROM student
            WHERE registration_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
              AND LOWER(student_state) = 'active'
            GROUP BY DATE(registration_date)
        ");

        $weekLabels = [];
        $appsSeries = [];
        $regsSeries = [];
        $appsMap = array_column($apps7, 'n', 'd');
        $regsMap = array_column($regs7, 'n', 'd');
        for ($i = 6; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-{$i} day"));
            $weekLabels[]  = date('D', strtotime($date));
            $appsSeries[]  = (int)($appsMap[$date] ?? 0);
            $regsSeries[]  = (int)($regsMap[$date] ?? 0);
        }

        // Star students: top by percentage in module_marks. Falls back to empty list.
        $starRows = $db->fetchAll("
            SELECT mm.student_regnumber AS reg,
                   AVG(mm.percentage)   AS percent_avg,
                   SUM(mm.total)        AS marks_sum,
                   COUNT(*)             AS modules,
                   ANY_VALUE(s.fname)    AS fname,
                   ANY_VALUE(s.lname)    AS lname,
                   ANY_VALUE(s.acc_year) AS acc_year
            FROM module_marks mm
            LEFT JOIN student s ON s.regnumber = mm.student_regnumber
            WHERE mm.percentage IS NOT NULL
            GROUP BY mm.student_regnumber
            ORDER BY percent_avg DESC, marks_sum DESC
            LIMIT 5
        ");

        $stars = [];
        foreach ($starRows as $r) {
            $name = trim(($r['fname'] ?? '') . ' ' . ($r['lname'] ?? ''));
            $stars[] = [
                'name'    => $name !== '' ? $name : ($r['reg'] ?? ''),
                'id'      => $r['reg'] ?? '',
                'marks'   => (float)($r['marks_sum'] ?? 0),
                'percent' => (float)($r['percent_avg'] ?? 0),
                'year'    => $r['acc_year'] ?? '',
            ];
        }

        // Activity feed: latest 5 events across applications, payments, employees.
        $activity = [];
        $recentApps = $db->fetchAll("
            SELECT application_number, first_name, last_name, status, created_at
            FROM student_applications
            WHERE status <> 'draft'
            ORDER BY id DESC LIMIT 3
        ");
        foreach ($recentApps as $a) {
            $activity[] = [
                'kind'   => 'application',
                'title'  => 'New Application',
                'detail' => trim(($a['first_name'] ?? '') . ' ' . ($a['last_name'] ?? '')) . ' — ' . ($a['application_number'] ?? ''),
                'at'     => $a['created_at'] ?? null,
            ];
        }
        $recentPays = $db->fetchAll("
            SELECT amount, fee_type, paid_at, status
            FROM fee_payments
            ORDER BY id DESC LIMIT 2
        ");
        foreach ($recentPays as $p) {
            $activity[] = [
                'kind'   => 'payment',
                'title'  => 'Fee Payment',
                'detail' => number_format((float)$p['amount']) . ' RWF — ' . ($p['fee_type'] ?? ''),
                'at'     => $p['paid_at'] ?? null,
            ];
        }
        usort($activity, fn($a, $b) => strcmp((string)($b['at'] ?? ''), (string)($a['at'] ?? '')));
        $activity = array_slice($activity, 0, 5);

        $this->success($response, [
            'stats' => [
                'students'   => $studentsTotal,
                'employees'  => $employeesTotal,
                'applicants' => $applicantsTotal,
                'revenue'    => $revenueTotal,
            ],
            'levels' => [
                'undergraduate' => (int)($levelRow['undergraduate'] ?? 0),
                'postgraduate'  => (int)($levelRow['postgraduate']  ?? 0),
                'masters'       => (int)($levelRow['masters']       ?? 0),
            ],
            'gender' => [
                'male'    => (int)($genderRow['male']    ?? 0),
                'female'  => (int)($genderRow['female']  ?? 0),
                'unknown' => (int)($genderRow['unknown'] ?? 0),
            ],
            'trend' => [
                'labels'       => $weekLabels,
                'applications' => $appsSeries,
                'registrations'=> $regsSeries,
            ],
            'stars'    => $stars,
            'activity' => $activity,
        ], 'Dashboard data fetched.');
    }
}
