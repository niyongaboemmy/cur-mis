<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;

class AdminDashboardController extends BaseController
{
    /**
     * Map the topnav Category bucket onto every spelling the legacy
     * `student.category` column may hold (both "undergraduate" and
     * "under graduate", etc.). Unknown buckets yield an empty array so
     * the filter becomes a no-op rather than silently zeroing the result
     * set.
     *
     * @return array<int, string>
     */
    private static function categoryVariants(string $value): array
    {
        $value = strtolower(trim($value));
        if ($value === '') return [];
        return match ($value) {
            'undergraduate', 'under graduate', 'under-graduate' => ['undergraduate', 'under graduate'],
            'postgraduate',  'post graduate',  'post-graduate'  => ['postgraduate',  'post graduate'],
            default => [$value],
        };
    }

    public function overview(Request $request, Response $response): never
    {
        $db = Database::getInstance();

        // ── Topnav scopes ────────────────────────────────────────────────
        // `campus`   → student.campus (varchar of campuses.id)
        // `category` → student.category bucket from the topbar switcher.
        // Both are optional; when blank the dashboard returns the full
        // unscoped aggregate.
        $campusFilter = trim((string)($request->query('campus') ?? ''));
        if ($campusFilter !== '') {
            $campusScope = " AND s.campus = ?";
            $campusBind  = [$campusFilter];
        } else {
            $campusScope = '';
            $campusBind  = [];
        }

        $categoryFilter   = trim((string)($request->query('category') ?? ''));
        $categoryVariants = $categoryFilter !== '' ? self::categoryVariants($categoryFilter) : [];
        if (!empty($categoryVariants)) {
            $ph = implode(',', array_fill(0, count($categoryVariants), '?'));
            $categoryScope = " AND LOWER(TRIM(s.category)) IN ($ph)";
            $categoryBind  = $categoryVariants;
        } else {
            $categoryScope = '';
            $categoryBind  = [];
        }

        $studentScope = $campusScope . $categoryScope;
        $studentBind  = array_merge($campusBind, $categoryBind);

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
              {$studentScope}
        ", $studentBind) ?: [];

        $studentsTotal = (int)($levelRow['total'] ?? 0);

        $genderRow = $db->fetchOne("
            SELECT
              SUM(CASE WHEN LOWER(TRIM(s.gender)) IN ('m','male')   THEN 1 ELSE 0 END) AS male,
              SUM(CASE WHEN LOWER(TRIM(s.gender)) IN ('f','female') THEN 1 ELSE 0 END) AS female,
              SUM(CASE WHEN s.gender IS NULL OR TRIM(s.gender) = ''
                        OR LOWER(TRIM(s.gender)) NOT IN ('m','male','f','female')
                        THEN 1 ELSE 0 END) AS unknown
            FROM student s
            WHERE LOWER(s.student_state) = 'active'
              {$studentScope}
        ", $studentBind) ?: [];

        $employeesTotal = (int)($db->fetchOne("SELECT COUNT(*) AS n FROM employees")['n'] ?? 0);
        $applicantsTotal = (int)($db->fetchOne("SELECT COUNT(*) AS n FROM student_applications WHERE status <> 'draft'")['n'] ?? 0);
        $revenueTotal = (float)($db->fetchOne("SELECT COALESCE(SUM(amount),0) AS s FROM fee_payments WHERE status = 'confirmed'")['s'] ?? 0);

        // Small helper: run a guarded scalar query so a missing table/column on
        // a not-yet-migrated DB degrades to a default instead of 500-ing the
        // whole dashboard.
        $safe = static function (callable $fn, $default = 0) {
            try { return $fn(); } catch (\Throwable) { return $default; }
        };

        // ── Student body by state (all states, not just active) ────────────
        $stateRow = $safe(fn() => $db->fetchOne("
            SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN LOWER(s.student_state) = 'active'    THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN LOWER(s.student_state) = 'inactive'  THEN 1 ELSE 0 END) AS inactive,
              SUM(CASE WHEN LOWER(s.student_state) = 'graduated' THEN 1 ELSE 0 END) AS graduated,
              SUM(CASE WHEN LOWER(s.student_state) = 'suspended' THEN 1 ELSE 0 END) AS suspended
            FROM student s WHERE 1=1 {$studentScope}
        ", $studentBind) ?: [], []);

        $intlActive = (int)$safe(fn() => $db->fetchOne("
            SELECT COUNT(*) AS n FROM student s
            WHERE s.is_international = 1 AND LOWER(s.student_state) = 'active' {$studentScope}
        ", $studentBind)['n'] ?? 0);

        $yearStart   = date('Y') . '-01-01';
        $newThisYear = (int)$safe(fn() => $db->fetchOne("
            SELECT COUNT(*) AS n FROM student s
            WHERE s.registration_date >= ? {$studentScope}
        ", array_merge([$yearStart], $studentBind))['n'] ?? 0);

        // ── Academics (university-wide) ────────────────────────────────────
        $academics = [
            'programmes'  => (int)$safe(fn() => $db->fetchOne("SELECT COUNT(*) AS n FROM options")['n'] ?? 0),
            'departments' => (int)$safe(fn() => $db->fetchOne("SELECT COUNT(*) AS n FROM departements")['n'] ?? 0),
            'faculties'   => (int)$safe(fn() => $db->fetchOne("SELECT COUNT(*) AS n FROM faculty")['n'] ?? 0),
            'modules'     => (int)$safe(fn() => $db->fetchOne("SELECT COUNT(*) AS n FROM modules")['n'] ?? 0),
        ];
        $marksRow = $safe(fn() => $db->fetchOne("
            SELECT COUNT(*) AS recorded,
                   COUNT(DISTINCT student_regnumber) AS students,
                   SUM(CASE WHEN percentage IS NOT NULL THEN 1 ELSE 0 END) AS graded,
                   SUM(CASE WHEN percentage >= 50 THEN 1 ELSE 0 END) AS passed
            FROM module_marks
        ") ?: [], []);
        $graded = (int)($marksRow['graded'] ?? 0);
        $academics['marks_recorded']      = (int)($marksRow['recorded'] ?? 0);
        $academics['students_with_marks'] = (int)($marksRow['students'] ?? 0);
        $academics['pass_rate']           = $graded > 0 ? round(((int)($marksRow['passed'] ?? 0) / $graded) * 100, 1) : 0.0;

        // ── Finance (current academic year + all-time) ─────────────────────
        $curYear = (int)$safe(fn() => $db->fetchOne("SELECT id FROM academic_years WHERE is_current = 1 ORDER BY id DESC LIMIT 1")['id'] ?? 0);
        $finance = [
            'currency'           => 'RWF',
            'revenue_all'        => $revenueTotal,
            'revenue_year'       => (float)$safe(fn() => $curYear > 0 ? ($db->fetchOne("SELECT COALESCE(SUM(amount),0) AS s FROM fee_payments WHERE status='confirmed' AND academic_year_id = ?", [$curYear])['s'] ?? 0) : 0),
            'pending_amount'     => (float)$safe(fn() => $db->fetchOne("SELECT COALESCE(SUM(amount),0) AS s FROM fee_payments WHERE status='pending'")['s'] ?? 0),
            'payments_confirmed' => (int)$safe(fn() => $db->fetchOne("SELECT COUNT(*) AS n FROM fee_payments WHERE status='confirmed'")['n'] ?? 0),
        ];
        $invRow = $safe(fn() => $curYear > 0
            ? ($db->fetchOne("SELECT COALESCE(SUM(amount_due),0) AS due, COALESCE(SUM(amount_paid),0) AS paid, COALESCE(SUM(bursary_applied),0) AS bursary FROM fee_invoices WHERE academic_year_id = ?", [$curYear]) ?: [])
            : [], []);
        $finance['invoiced_year']    = (float)($invRow['due'] ?? 0);
        $finance['collected_year']   = (float)($invRow['paid'] ?? 0);
        $finance['outstanding_year'] = max(0.0, (float)($invRow['due'] ?? 0) - (float)($invRow['paid'] ?? 0) - (float)($invRow['bursary'] ?? 0));

        // ── Applicants by status ───────────────────────────────────────────
        $applicantsByStatus = [];
        foreach ($safe(fn() => $db->fetchAll("SELECT status, COUNT(*) AS n FROM student_applications WHERE status <> 'draft' GROUP BY status"), []) as $r) {
            $applicantsByStatus[(string)$r['status']] = (int)$r['n'];
        }

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
            SELECT DATE(s.registration_date) AS d, COUNT(*) AS n
            FROM student s
            WHERE s.registration_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
              AND LOWER(s.student_state) = 'active'
              {$studentScope}
            GROUP BY DATE(s.registration_date)
        ", $studentBind);

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
        // Scoped to the topbar campus/category through the joined student row
        // so postgrad-only mode doesn't surface undergraduate stars (and vice
        // versa).
        $starRows = $db->fetchAll("
            SELECT mm.student_regnumber AS reg,
                   AVG(mm.percentage)   AS percent_avg,
                   SUM(mm.total)        AS marks_sum,
                   COUNT(*)             AS modules,
                   MIN(s.fname)    AS fname,
                   MIN(s.lname)    AS lname,
                   MIN(s.acc_year) AS acc_year
            FROM module_marks mm
            LEFT JOIN student s ON s.regnumber COLLATE utf8mb4_unicode_ci = mm.student_regnumber COLLATE utf8mb4_unicode_ci
            WHERE mm.percentage IS NOT NULL
              {$studentScope}
            GROUP BY mm.student_regnumber
            ORDER BY percent_avg DESC, marks_sum DESC
            LIMIT 5
        ", $studentBind);

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
            'students_breakdown' => [
                'total'         => (int)($stateRow['total']     ?? 0),
                'active'        => (int)($stateRow['active']    ?? 0),
                'inactive'      => (int)($stateRow['inactive']  ?? 0),
                'graduated'     => (int)($stateRow['graduated'] ?? 0),
                'suspended'     => (int)($stateRow['suspended'] ?? 0),
                'international'  => $intlActive,
                'new_this_year' => $newThisYear,
            ],
            'academics' => $academics,
            'finance'   => $finance,
            'applicants_by_status' => $applicantsByStatus,
            'stars'    => $stars,
            'activity' => $activity,
        ], 'Dashboard data fetched.');
    }
}
