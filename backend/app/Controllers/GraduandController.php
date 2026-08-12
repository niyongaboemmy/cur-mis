<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Database;
use Core\Request;
use Core\Response;
use App\Services\DegreeClassificationService;
use App\Services\GraduationAuditService;
use App\Services\SystemLogService;

/**
 * Manages the graduand lifecycle:
 *   eligibility check → graduation list → approve → graduate / defer
 *
 * Routes:
 *   GET  /api/graduands/eligibility          → VIEW_GRADUANDS
 *   GET  /api/graduands/completion           → VIEW_GRADUANDS
 *   GET  /api/graduands/completion/:id       → VIEW_GRADUANDS
 *   GET  /api/graduands                      → VIEW_GRADUANDS
 *   POST /api/graduands                      → MANAGE_GRADUANDS
 *   PUT  /api/graduands/:id/approve          → MANAGE_GRADUANDS
 *   PUT  /api/graduands/:id/graduate         → MANAGE_GRADUANDS
 *   PUT  /api/graduands/:id/defer            → MANAGE_GRADUANDS
 *   DELETE /api/graduands/:id               → MANAGE_GRADUANDS
 */
class GraduandController extends BaseController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    private function authUserId(Request $request): int
    {
        $user = (array)($request->param('_auth_user') ?? []);
        return (int)($user['id'] ?? 0);
    }

    /* ── Eligibility list ────────────────────────────────────────────────── */

    /**
     * GET /api/graduands/eligibility
     * Returns active students who have marks recorded, along with their
     * weighted average, degree class suggestion, and pass/fail counts.
     *
     * Filters: academic_year_id, std_option (program option id), current_level
     */
    public function eligibilityList(Request $request, Response $response): never
    {
        $yearId  = (int)($request->query('academic_year_id') ?? 0);
        $option  = $request->query('std_option')   ?? null;
        $level   = (int)($request->query('current_level')   ?? 0);
        $page    = max(1, (int)($request->query('page')     ?? 1));
        // Cap matches the page-size selector in the UI (50/100/150/200/500);
        // a lower cap here would silently return fewer rows than the page
        // claims to be showing.
        $perPage = min(500, max(10, (int)($request->query('per_page') ?? 50)));
        $offset  = ($page - 1) * $perPage;

        // Pull all active students with at least one mark recorded
        $where  = ["st.student_state = 'active'"];
        $args   = [];

        if ($option) {
            $where[] = 'st.std_option = ?';
            $args[]  = $option;
        }
        if ($level > 0) {
            $where[] = 'CAST(NULLIF(st.current_level,\'\') AS UNSIGNED) = ?';
            $args[]  = $level;
        }

        // Optionally narrow marks to a specific academic year
        $yearJoin   = '';
        $yearFilter = '';
        if ($yearId > 0) {
            $yearJoin   = "LEFT JOIN academic_terms t2 ON t2.id = mm2.academic_term_id";
            $yearFilter = "AND t2.academic_year_id = {$yearId}";
        }

        $whereStr = implode(' AND ', $where);

        $total = (int)($this->db->fetchOne(
            "SELECT COUNT(DISTINCT st.id) AS n
             FROM `student` st
             INNER JOIN module_marks mm2 ON mm2.student_regnumber = st.regnumber
                                        AND mm2.percentage IS NOT NULL
             {$yearJoin}
             WHERE {$whereStr} {$yearFilter}",
            $args
        )['n'] ?? 0);

        $students = $this->db->fetchAll(
            "SELECT DISTINCT st.id, st.regnumber, st.fname, st.lname,
                    st.current_level, st.std_option, st.faculty, st.department,
                    f.fac_name, d.dep_name,
                    o.acro AS option_acronym, o.title AS option_title
             FROM `student` st
             INNER JOIN module_marks mm2 ON mm2.student_regnumber = st.regnumber
                                        AND mm2.percentage IS NOT NULL
             {$yearJoin}
             LEFT JOIN faculty       f ON CAST(f.fac_id AS CHAR) COLLATE utf8mb4_unicode_ci = st.faculty COLLATE utf8mb4_unicode_ci
             LEFT JOIN departements  d ON CAST(d.dep_id AS CHAR) COLLATE utf8mb4_unicode_ci = st.department COLLATE utf8mb4_unicode_ci
             LEFT JOIN dep_options   do2 ON do2.op_id = st.std_option
             LEFT JOIN options       o  ON o.acro = do2.option_acronym
             WHERE {$whereStr} {$yearFilter}
             ORDER BY st.lname, st.fname
             LIMIT ? OFFSET ?",
            [...$args, $perPage, $offset]
        );

        // Compute eligibility for each student
        $result = [];
        foreach ($students as $s) {
            $eligibility = DegreeClassificationService::eligibleForGraduation(
                $s['regnumber'],
                $yearId > 0 ? $yearId : null
            );
            $result[] = array_merge($s, $eligibility);
        }

        $this->success($response, [
            'data'      => $result,
            'total'     => $total,
            'page'      => $page,
            'per_page'  => $perPage,
            'last_page' => (int)ceil($total / $perPage),
        ], 'Eligibility list fetched.');
    }

    /* ── Curriculum completion audit ─────────────────────────────────────── */

    /**
     * Filters shared by the audit list, its CSV export and the graduation
     * roster. All of them read `graduation_audit`, which is denormalised so
     * these never have to touch `student` except for the name search.
     *
     * @return array{where:string, args:array<int,mixed>, base_where:string,
     *               base_args:array<int,mixed>, state:string}
     */
    private function completionFilters(Request $request, string $startedBefore): array
    {
        // Base filters exclude the program one, so the program picker can still
        // list every program in the cohort once a program is selected.
        $base     = ['ga.started_on IS NOT NULL', 'ga.started_on <= ?'];
        $baseArgs = [$startedBefore];

        $state = (string)($request->query('student_state') ?? 'active');
        if ($state !== 'all' && $state !== '') {
            $base[]     = 'ga.student_state = ?';
            $baseArgs[] = $state;
        }
        $level = (int)($request->query('current_level') ?? 0);
        if ($level > 0) {
            $base[]     = 'ga.current_level = ?';
            $baseArgs[] = $level;
        }
        $search = trim((string)($request->query('search') ?? ''));
        if ($search !== '') {
            $base[] = '(ga.regnumber LIKE ? OR s.fname LIKE ? OR s.lname LIKE ?)';
            $like   = '%' . $search . '%';
            array_push($baseArgs, $like, $like, $like);
        }

        $where  = $base;
        $args   = $baseArgs;
        $option = trim((string)($request->query('std_option') ?? ''));
        if ($option !== '') {
            $where[] = 'ga.option_id = ?';
            $args[]  = (int)$option;
        }

        return [
            'where'      => implode(' AND ', $where),
            'args'       => $args,
            'base_where' => implode(' AND ', $base),
            'base_args'  => $baseArgs,
            'state'      => $state,
        ];
    }

    /** Completion-bucket predicate for the `completion` query param. */
    private function completionPredicate(string $completion): string
    {
        return match ($completion) {
            'complete'      => ' AND ga.is_complete = 1',
            'incomplete'    => ' AND ga.is_complete = 0 AND ga.expected > 0',
            'with_failures' => ' AND ga.failed > 0',
            default         => '',
        };
    }

    /** ORDER BY for the `sort` query param. */
    private function completionOrderBy(string $sort): string
    {
        return match ($sort) {
            'started'    => 'ga.started_on ASC, ga.outstanding DESC',
            'missing'    => 'ga.outstanding DESC, ga.started_on ASC',
            'name'       => 's.lname ASC, s.fname ASC, ga.student_id ASC',
            default      => 'ga.percent_complete DESC, ga.outstanding ASC, ga.started_on ASC',
        };
    }

    /** The SELECT list every audit row shares. */
    private const AUDIT_COLUMNS = "
        ga.student_id AS id, ga.regnumber, ga.option_id AS std_option,
        ga.started_on, ga.start_source, ga.intake_year,
        ga.student_state, ga.current_level, ga.programme_level,
        ga.expected, ga.recorded, ga.passed, ga.failed, ga.exempted,
        ga.pending, ga.missing, ga.outstanding,
        ga.percent_complete, ga.is_complete,
        ga.credits_expected, ga.credits_earned, ga.weighted_avg,
        s.fname, s.lname, s.acc_year, s.campus, s.graduation_status,
        o.name AS option_name, o.title AS option_title, o.acro AS option_acronym,
        d.dep_name";

    /** The FROM/JOIN chain every audit row shares. */
    private const AUDIT_FROM = "
        FROM `graduation_audit` ga
        JOIN `student`       s ON s.id     = ga.student_id
        LEFT JOIN `options`      o ON o.id     = ga.option_id
        LEFT JOIN `departements` d ON d.dep_id = o.department_id";

    /**
     * Shape one snapshot row for the API.
     *
     * @param array<string,mixed> $r
     * @return array<string,mixed>
     */
    private function shapeAuditRow(array $r): array
    {
        return [
            'id'                => (int)$r['id'],
            'regnumber'         => $r['regnumber'],
            'fname'             => $r['fname'],
            'lname'             => $r['lname'],
            'current_level'     => $r['current_level'] !== null ? (string)$r['current_level'] : null,
            'std_option'        => $r['std_option'] !== null ? (string)$r['std_option'] : null,
            'student_state'     => $r['student_state'],
            'acc_year'          => $r['acc_year'],
            'campus'            => $r['campus'],
            'programme_level'   => $r['programme_level'],
            'graduation_status' => $r['graduation_status'],
            'started_on'        => $r['started_on'],
            'start_source'      => $r['start_source'],
            'intake_year'       => $r['intake_year'] !== null ? (int)$r['intake_year'] : null,
            'option_name'       => $r['option_name'],
            'option_title'      => $r['option_title'],
            'option_acronym'    => $r['option_acronym'],
            'dep_name'          => $r['dep_name'],
            'expected'          => (int)$r['expected'],
            'recorded'          => (int)$r['recorded'],
            'passed'            => (int)$r['passed'],
            'failed'            => (int)$r['failed'],
            'exempted'          => (int)$r['exempted'],
            'pending'           => (int)$r['pending'],
            'missing'           => (int)$r['missing'],
            'outstanding'       => (int)$r['outstanding'],
            'complete'          => (int)$r['is_complete'] === 1,
            'percent_complete'  => $r['percent_complete'] !== null ? (float)$r['percent_complete'] : null,
            'credits_expected'  => (int)$r['credits_expected'],
            'credits_earned'    => (int)$r['credits_earned'],
            'weighted_avg'      => $r['weighted_avg'] !== null ? (float)$r['weighted_avg'] : null,
            'curriculum_suspect'=> (int)$r['expected'] > GraduationAuditService::CURRICULUM_SUSPECT_THRESHOLD,
        ];
    }

    /**
     * 503 with an actionable message when `graduation_audit` is absent, rather
     * than letting every query below die with a bare "table doesn't exist".
     * The deploy workflow ships code on push but migrations run from a separate
     * manual workflow, so this is the shape a half-migrated environment takes.
     */
    private function requireSnapshotTable(Response $response): void
    {
        if (!GraduationAuditService::snapshotExists()) {
            $this->error(
                $response,
                'The graduation_audit table is missing — migration '
                . '2026_08_12_128_create_graduation_audit_snapshot.sql has not been applied '
                . 'to this environment.',
                503,
                ['code' => 'snapshot_table_missing']
            );
        }
    }

    /** Validate `started_before`, or 422. */
    private function requireStartedBefore(Request $request, Response $response): string
    {
        $v = trim((string)($request->query('started_before') ?? ''));
        if ($v === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
            $this->error($response, 'started_before is required and must be a YYYY-MM-DD date.', 422);
        }
        return $v;
    }

    /**
     * GET /api/graduands/completion
     *
     * The cohort view behind the graduation list: every student who started on
     * or before `started_before`, with how many of their program's modules have
     * marks recorded and how many are still outstanding.
     *
     * Reads the `graduation_audit` snapshot, so this is a single indexed query
     * however wide the cut-off date. The live computation it replaced took ~7s
     * for the full table. `computed_at` travels with the response so the UI can
     * say how fresh the numbers are and offer a rebuild.
     *
     * Query params:
     *   started_before  YYYY-MM-DD  (required — the cohort cut-off)
     *   completion      all | complete | incomplete | with_failures
     *                   (default: complete — the students ready to graduate)
     *   std_option, current_level, student_state, search
     *   sort            name | started | missing | completion
     *   page, per_page
     */
    public function completionList(Request $request, Response $response): never
    {
        $this->requireSnapshotTable($response);
        $startedBefore = $this->requireStartedBefore($request, $response);

        $completion = (string)($request->query('completion') ?? 'complete');
        if (!in_array($completion, ['all', 'complete', 'incomplete', 'with_failures'], true)) {
            $completion = 'complete';
        }
        // "Closest to done first". Sorting by raw outstanding count would put
        // the programs with an over-broad curriculum at the top (273 expected,
        // 271 missing) and bury students a module or two from graduating.
        $sort = (string)($request->query('sort') ?? 'completion');
        if (!in_array($sort, ['name', 'started', 'missing', 'completion'], true)) {
            $sort = 'completion';
        }

        $page    = max(1, (int)($request->query('page') ?? 1));
        $perPage = min(500, max(10, (int)($request->query('per_page') ?? 50)));
        $offset  = ($page - 1) * $perPage;

        $f    = $this->completionFilters($request, $startedBefore);
        $pred = $this->completionPredicate($completion);

        $total = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS n" . self::AUDIT_FROM . " WHERE {$f['where']}{$pred}",
            $f['args']
        )['n'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT " . self::AUDIT_COLUMNS . self::AUDIT_FROM . "
             WHERE {$f['where']}{$pred}
             ORDER BY " . $this->completionOrderBy($sort) . "
             LIMIT ? OFFSET ?",
            [...$f['args'], $perPage, $offset]
        );

        // All five counters in one pass, so the tabs always agree with the list.
        $summary = $this->db->fetchOne(
            "SELECT COUNT(*)                                        AS cohort,
                    SUM(ga.is_complete = 1)                         AS complete,
                    SUM(ga.is_complete = 0 AND ga.expected > 0)     AS incomplete,
                    SUM(ga.failed > 0)                              AS with_failures,
                    SUM(ga.expected = 0)                            AS no_curriculum,
                    SUM(ga.expected > 0 AND ga.recorded = 0)        AS no_marks"
            . self::AUDIT_FROM . " WHERE {$f['where']}",
            $f['args']
        ) ?: [];

        // Programs in the cohort, for the filter dropdown. Derived from the
        // cohort rather than the `options` catalogue so it needs no
        // MANAGE_OPTIONS grant and lists only programs with students in it.
        $programs = $this->db->fetchAll(
            "SELECT o.id, o.name, o.acro, COUNT(*) AS students"
            . self::AUDIT_FROM . "
             WHERE {$f['base_where']} AND ga.option_id IS NOT NULL
             GROUP BY o.id, o.name, o.acro
             ORDER BY o.name",
            $f['base_args']
        );

        $this->success($response, [
            'data'           => array_map(fn ($r) => $this->shapeAuditRow($r), $rows),
            'total'          => $total,
            'page'           => $page,
            'per_page'       => $perPage,
            'last_page'      => max(1, (int)ceil($total / $perPage)),
            'summary'        => array_map('intval', array_map(
                static fn ($v) => $v ?? 0,
                array_intersect_key($summary, array_flip([
                    'cohort', 'complete', 'incomplete', 'with_failures',
                    'no_curriculum', 'no_marks',
                ]))
            )),
            'programs'       => array_map(static fn ($p) => [
                'id'       => (int)$p['id'],
                'name'     => $p['name'],
                'acro'     => $p['acro'],
                'students' => (int)$p['students'],
            ], $programs),
            'started_before' => $startedBefore,
            'completion'     => $completion,
            'sort'           => $sort,
            'computed_at'    => GraduationAuditService::snapshotComputedAt(),
        ], 'Completion audit fetched.');
    }

    /**
     * POST /api/graduands/completion/rebuild
     * Recompute the whole snapshot. ~7s over 13.7k students and 292k marks.
     * Marks entry does not invalidate the snapshot on its own, so this is the
     * one place the numbers are refreshed.
     */
    public function completionRebuild(Request $request, Response $response): never
    {
        $this->requireSnapshotTable($response);

        @set_time_limit(300);
        $stats = GraduationAuditService::rebuildSnapshot();

        SystemLogService::log(
            'UPDATE', 'STUDENTS',
            "Graduation audit recomputed: {$stats['students']} students, {$stats['complete']} complete",
            null, 'graduation_audit'
        );

        $this->success($response, [
            'students'    => $stats['students'],
            'complete'    => $stats['complete'],
            'seconds'     => $stats['seconds'],
            'computed_at' => GraduationAuditService::snapshotComputedAt(),
        ], 'Graduation audit recomputed.');
    }

    /**
     * GET /api/graduands/completion/export
     * The same cohort as completionList(), every row rather than one page,
     * streamed as CSV. Authorised by `?token=` so it can be a plain download
     * link, the same way the student curriculum export works.
     */
    public function completionExport(Request $request, Response $response): never
    {
        $this->requireSnapshotTable($response);
        $startedBefore = $this->requireStartedBefore($request, $response);

        $completion = (string)($request->query('completion') ?? 'complete');
        if (!in_array($completion, ['all', 'complete', 'incomplete', 'with_failures'], true)) {
            $completion = 'complete';
        }
        $sort = (string)($request->query('sort') ?? 'completion');
        if (!in_array($sort, ['name', 'started', 'missing', 'completion'], true)) {
            $sort = 'completion';
        }

        $f    = $this->completionFilters($request, $startedBefore);
        $pred = $this->completionPredicate($completion);

        $rows = $this->db->fetchAll(
            "SELECT " . self::AUDIT_COLUMNS . self::AUDIT_FROM . "
             WHERE {$f['where']}{$pred}
             ORDER BY " . $this->completionOrderBy($sort),
            $f['args']
        );

        $label = match ($completion) {
            'complete'      => 'fully-recorded',
            'incomplete'    => 'missing-modules',
            'with_failures' => 'with-failures',
            default         => 'all',
        };

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="'
            . "graduation-audit-{$label}-before-{$startedBefore}.csv" . '"');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('X-Content-Type-Options: nosniff');

        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF"); // Excel-friendly UTF-8 BOM

        fputcsv($out, ['Graduation completion audit']);
        fputcsv($out, ['Students who started on or before', $startedBefore]);
        fputcsv($out, ['Filter', $label]);
        fputcsv($out, ['Enrolment status', $f['state'] === 'all' ? 'all' : $f['state']]);
        fputcsv($out, ['Students', count($rows)]);
        fputcsv($out, ['Figures computed', GraduationAuditService::snapshotComputedAt() ?? 'never']);
        fputcsv($out, ['Exported', date('Y-m-d H:i')]);
        fputcsv($out, []);

        fputcsv($out, [
            'Reg number', 'Last name', 'First name', 'Program', 'Department',
            'Year of study', 'Enrolment status', 'Started', 'Start date source',
            'Modules expected', 'Modules recorded', '% recorded',
            'Passed', 'Failed', 'Exempted', 'Awaiting marks', 'Not taken',
            'Outstanding', 'Credits earned', 'Credits required', 'Weighted average',
            'Verdict', 'Curriculum warning',
        ]);

        foreach ($rows as $raw) {
            $r = $this->shapeAuditRow($raw);
            fputcsv($out, [
                $r['regnumber'] ?? '',
                $r['lname'] ?? '',
                $r['fname'] ?? '',
                $r['option_name'] ?? $r['option_acronym'] ?? '',
                $r['dep_name'] ?? '',
                $r['current_level'] ?? '',
                $r['student_state'] ?? '',
                $r['started_on'] ?? '',
                $r['start_source'] === 'regnumber' ? 'reg number (intake year)' : 'registration date',
                $r['expected'], $r['recorded'],
                $r['percent_complete'] !== null ? $r['percent_complete'] . '%' : '',
                $r['passed'], $r['failed'], $r['exempted'], $r['pending'], $r['missing'],
                $r['outstanding'],
                $r['credits_earned'], $r['credits_expected'],
                $r['weighted_avg'] !== null ? $r['weighted_avg'] . '%' : '',
                $r['expected'] === 0     ? 'No curriculum mapped'
                    : ($r['outstanding'] > 0 ? 'Incomplete'
                    : ($r['failed'] > 0      ? 'Resits due' : 'Complete')),
                $r['curriculum_suspect'] ? 'Program curriculum looks misconfigured' : '',
            ]);
        }

        fclose($out);
        exit;
    }

    /* ── Graduation roster ───────────────────────────────────────────────── */

    /**
     * GET /api/graduands/ready
     *
     * The students who have finished: a mark recorded for every module their
     * program requires. This is what the Graduation list is built from, so each
     * row also carries whatever `graduands` lifecycle record already exists —
     * `graduand_status` is null until someone adds them to the list.
     *
     * `clean` (default 1) additionally excludes anyone still carrying a failed
     * module, since a resit outstanding is not a graduand.
     *
     * Query params: started_before (optional), std_option, current_level,
     *               student_state, search, clean, sort, page, per_page
     */
    public function readyList(Request $request, Response $response): never
    {
        // Unlike the audit, the roster has no natural cut-off — someone who
        // finished last year is still a graduand — so the date is optional and
        // defaults to "no bound".
        $this->requireSnapshotTable($response);

        $startedBefore = trim((string)($request->query('started_before') ?? ''));
        if ($startedBefore !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $startedBefore)) {
            $this->error($response, 'started_before must be a YYYY-MM-DD date.', 422);
        }

        $clean   = ($request->query('clean') ?? '1') !== '0';
        $sort    = (string)($request->query('sort') ?? 'name');
        $page    = max(1, (int)($request->query('page') ?? 1));
        $perPage = min(500, max(10, (int)($request->query('per_page') ?? 50)));
        $offset  = ($page - 1) * $perPage;

        $where = ['ga.is_complete = 1'];
        $args  = [];

        if ($startedBefore !== '') {
            $where[] = 'ga.started_on IS NOT NULL AND ga.started_on <= ?';
            $args[]  = $startedBefore;
        }
        if ($clean) {
            $where[] = 'ga.failed = 0';
        }
        $state = (string)($request->query('student_state') ?? 'all');
        if ($state !== 'all' && $state !== '') {
            $where[] = 'ga.student_state = ?';
            $args[]  = $state;
        }
        $option = trim((string)($request->query('std_option') ?? ''));
        if ($option !== '') {
            $where[] = 'ga.option_id = ?';
            $args[]  = (int)$option;
        }
        // Department comes from the program, not the snapshot: `student.department`
        // is a legacy free-text column, while `options.department_id` is the
        // mapping the curriculum itself is built on.
        $dept = trim((string)($request->query('department') ?? ''));
        if ($dept !== '') {
            $where[] = 'o.department_id = ?';
            $args[]  = (int)$dept;
        }
        // Academic year the student registered in, decoded from the regnumber.
        $intake = (int)($request->query('intake_year') ?? 0);
        if ($intake > 0) {
            $where[] = 'ga.intake_year = ?';
            $args[]  = $intake;
        }
        $level = (int)($request->query('current_level') ?? 0);
        if ($level > 0) {
            $where[] = 'ga.current_level = ?';
            $args[]  = $level;
        }
        $search = trim((string)($request->query('search') ?? ''));
        if ($search !== '') {
            $where[] = '(ga.regnumber LIKE ? OR s.fname LIKE ? OR s.lname LIKE ?)';
            $like    = '%' . $search . '%';
            array_push($args, $like, $like, $like);
        }
        // Lifecycle filter. A student with no `graduands` row reads as 'waiting'
        // exactly like one stored with that status, so the filter has to match
        // both — see migration 130.
        $gstatus = trim((string)($request->query('graduand_status') ?? ''));
        if ($gstatus === 'waiting') {
            $where[] = "(g.id IS NULL OR g.status = 'waiting')";
        } elseif (in_array($gstatus, ['pending', 'approved', 'graduated'], true)) {
            $where[] = 'g.status = ?';
            $args[]  = $gstatus;
        }

        $whereStr = implode(' AND ', $where);
        $from     = "FROM `graduation_audit` ga
                     JOIN `student`          s ON s.id     = ga.student_id
                     LEFT JOIN `graduands`   g ON g.student_id = ga.student_id
                     LEFT JOIN `options`     o ON o.id     = ga.option_id
                     LEFT JOIN `departements` d ON d.dep_id = o.department_id";

        $orderBy = match ($sort) {
            'started' => 'ga.started_on ASC, s.lname ASC',
            'gpa'     => 'ga.weighted_avg DESC, s.lname ASC',
            'program' => 'o.name ASC, s.lname ASC, s.fname ASC',
            default   => 's.lname ASC, s.fname ASC',
        };

        $total = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS n {$from} WHERE {$whereStr}", $args
        )['n'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT " . self::AUDIT_COLUMNS . ",
                    g.id AS graduand_id, g.status AS graduand_status,
                    g.degree_class, g.graduation_date, g.ceremony_number,
                    g.cgpa AS graduand_cgpa
             {$from}
             WHERE {$whereStr}
             ORDER BY {$orderBy}
             LIMIT ? OFFSET ?",
            [...$args, $perPage, $offset]
        );

        // Counters span the whole ready pool, not the current filter, so the
        // status chips keep meaning the same thing as you narrow by program.
        $summary = $this->db->fetchOne(
            "SELECT COUNT(*)                                       AS ready,
                    SUM(g.id IS NULL OR g.status = 'waiting')      AS waiting,
                    SUM(g.status = 'pending')                      AS pending,
                    SUM(g.status = 'approved')                     AS approved,
                    SUM(g.status = 'graduated')                    AS graduated
             FROM `graduation_audit` ga
             JOIN `student`        s ON s.id         = ga.student_id
             LEFT JOIN `graduands` g ON g.student_id = ga.student_id
             WHERE ga.is_complete = 1" . ($clean ? ' AND ga.failed = 0' : ''),
            []
        ) ?: [];

        // Filter option lists, derived from the ready pool so they only ever
        // offer values that actually return rows.
        $poolWhere = 'ga.is_complete = 1' . ($clean ? ' AND ga.failed = 0' : '');
        $departments = $this->db->fetchAll(
            "SELECT d.dep_id AS id, d.dep_name AS name, COUNT(*) AS students
             FROM `graduation_audit` ga
             JOIN `options`      o ON o.id     = ga.option_id
             JOIN `departements` d ON d.dep_id = o.department_id
             WHERE {$poolWhere}
             GROUP BY d.dep_id, d.dep_name ORDER BY d.dep_name"
        );
        $programs = $this->db->fetchAll(
            "SELECT o.id, o.name, o.acro, o.department_id, COUNT(*) AS students
             FROM `graduation_audit` ga
             JOIN `options` o ON o.id = ga.option_id
             WHERE {$poolWhere}
             GROUP BY o.id, o.name, o.acro, o.department_id ORDER BY o.name"
        );
        $years = $this->db->fetchAll(
            "SELECT ga.intake_year AS year, COUNT(*) AS students
             FROM `graduation_audit` ga
             WHERE {$poolWhere} AND ga.intake_year IS NOT NULL
             GROUP BY ga.intake_year ORDER BY ga.intake_year DESC"
        );

        $data = array_map(function (array $r): array {
            $row = $this->shapeAuditRow($r);
            $row['graduand_id']     = $r['graduand_id'] !== null ? (int)$r['graduand_id'] : null;
            // No row yet means the same thing as a stored 'waiting'.
            $row['graduand_status'] = $r['graduand_status'] ?? 'waiting';
            $row['degree_class']    = $r['degree_class'];
            $row['graduation_date'] = $r['graduation_date'];
            $row['ceremony_number'] = $r['ceremony_number'];
            // The classification the weighted average implies, offered as the
            // default when adding the student to the list.
            $row['suggested_class'] = $row['weighted_avg'] !== null
                ? DegreeClassificationService::classifyOrNull((float)$row['weighted_avg'])
                : null;
            return $row;
        }, $rows);

        $this->success($response, [
            'data'        => $data,
            'total'       => $total,
            'page'        => $page,
            'per_page'    => $perPage,
            'last_page'   => max(1, (int)ceil($total / $perPage)),
            'summary'     => array_map('intval', array_map(
                static fn ($v) => $v ?? 0,
                array_intersect_key($summary, array_flip([
                    'ready', 'waiting', 'pending', 'approved', 'graduated',
                ]))
            )),
            'departments' => array_map(static fn ($d) => [
                'id'       => (int)$d['id'],
                'name'     => $d['name'],
                'students' => (int)$d['students'],
            ], $departments),
            'programs'    => array_map(static fn ($p) => [
                'id'            => (int)$p['id'],
                'name'          => $p['name'],
                'acro'          => $p['acro'],
                'department_id' => $p['department_id'] !== null ? (int)$p['department_id'] : null,
                'students'      => (int)$p['students'],
            ], $programs),
            'intake_years' => array_map(static fn ($y) => [
                'year'     => (int)$y['year'],
                'students' => (int)$y['students'],
            ], $years),
            'computed_at' => GraduationAuditService::snapshotComputedAt(),
        ], 'Graduation roster fetched.');
    }


    /**
     * POST /api/graduands/bulk-status
     *
     * Move a set of finished students to a graduation status in one go.
     * `graduands` rows are created on demand, so a student who has never been
     * on the list (and therefore reads as 'waiting') can be promoted straight
     * to approved or graduated without a separate "add" step.
     *
     * Body: { student_ids: int[], status: waiting|pending|approved|graduated,
     *         degree_class?, graduation_date?, ceremony_number? }
     *
     * Only students the audit marks complete can be set — the roster is the
     * only route in, and letting an id from somewhere else through would put
     * an unfinished student on the graduation list.
     */
    public function bulkStatus(Request $request, Response $response): never
    {
        $this->requireSnapshotTable($response);

        $body   = $request->body();
        $ids    = array_values(array_unique(array_filter(
            array_map('intval', (array)($body['student_ids'] ?? [])),
            static fn ($v) => $v > 0
        )));
        $status = (string)($body['status'] ?? '');

        if (!$ids) {
            $this->error($response, 'Select at least one student.', 422);
        }
        if (!in_array($status, ['waiting', 'pending', 'approved', 'graduated'], true)) {
            $this->error($response, 'status must be waiting, pending, approved or graduated.', 422);
        }
        if (count($ids) > 2000) {
            $this->error($response, 'Too many students in one update — narrow the selection.', 422);
        }

        $degreeClass = isset($body['degree_class'])
            && in_array($body['degree_class'], ['First Class','Upper Second','Lower Second','Pass','Distinction'], true)
            ? (string)$body['degree_class'] : null;
        $gradDate = $status === 'graduated'
            ? ((string)($body['graduation_date'] ?? '') ?: date('Y-m-d'))
            : null;
        $ceremony = $status === 'graduated' ? ((string)($body['ceremony_number'] ?? '') ?: null) : null;

        $ph = implode(',', array_fill(0, count($ids), '?'));

        // Snapshot figures come along for the ride so the graduation record
        // keeps the numbers it was granted on, rather than silently tracking
        // later recomputations.
        $eligible = $this->db->fetchAll(
            "SELECT ga.student_id, ga.weighted_avg, ga.credits_earned
             FROM `graduation_audit` ga
             WHERE ga.student_id IN ({$ph}) AND ga.is_complete = 1",
            $ids
        );
        if (!$eligible) {
            $this->error($response, 'None of the selected students have completed their curriculum.', 422);
        }

        $userId  = $this->authUserId($request) ?: null;
        $updated = 0;

        $this->db->beginTransaction();
        try {
            foreach ($eligible as $e) {
                $avg   = $e['weighted_avg'] !== null ? (float)$e['weighted_avg'] : null;
                $class = $degreeClass
                    ?? ($avg !== null ? DegreeClassificationService::classifyOrNull($avg) : null)
                    ?? 'Pass';

                $this->db->execute(
                    "INSERT INTO `graduands`
                        (student_id, status, degree_class, cgpa, total_credits,
                         graduation_date, ceremony_number, approved_by, approved_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        status          = VALUES(status),
                        degree_class    = VALUES(degree_class),
                        cgpa            = VALUES(cgpa),
                        total_credits   = VALUES(total_credits),
                        -- Only stamp the ceremony fields when graduating; a
                        -- later move back to pending must not wipe them.
                        graduation_date = COALESCE(VALUES(graduation_date), graduation_date),
                        ceremony_number = COALESCE(VALUES(ceremony_number), ceremony_number),
                        approved_by     = VALUES(approved_by),
                        approved_at     = VALUES(approved_at)",
                    [
                        (int)$e['student_id'], $status, $class,
                        $avg, (int)$e['credits_earned'],
                        $gradDate, $ceremony,
                        in_array($status, ['approved', 'graduated'], true) ? $userId : null,
                        in_array($status, ['approved', 'graduated'], true) ? date('Y-m-d H:i:s') : null,
                    ]
                );
                $updated++;
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        SystemLogService::log(
            'UPDATE', 'STUDENTS',
            "Graduation status set to {$status} for {$updated} student(s)",
            null, 'graduand'
        );

        $skipped = count($ids) - $updated;
        $this->success($response, [
            'updated' => $updated,
            'skipped' => $skipped,
            'status'  => $status,
        ], $skipped > 0
            ? "{$updated} updated, {$skipped} skipped (curriculum not complete)."
            : "{$updated} student(s) set to {$status}.");
    }

    /**
     * GET /api/graduands/completion/:id
     * Drill-down for one student: every curriculum module grouped by level and
     * tagged passed / failed / exempted / pending / missing, plus any marks
     * recorded outside the program's curriculum.
     */
    public function completionDetail(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->db->fetchOne(
            "SELECT s.id, s.regnumber, s.fname, s.lname, s.current_level,
                    s.student_state, s.acc_year, s.campus, s.programme_level,
                    s.graduation_status, s.graduation_date, s.degree_class,
                    " . GraduationAuditService::optionIdSql('s')    . " AS std_option,
                    " . GraduationAuditService::startedOnSql('s')   . " AS started_on,
                    " . GraduationAuditService::startSourceSql('s') . " AS start_source,
                    " . GraduationAuditService::intakeYearSql('s')  . " AS intake_year
             FROM `student` s WHERE s.id = ? LIMIT 1",
            [$id]
        );
        if (!$student) {
            $this->error($response, 'Student not found.', 404);
        }

        $audit = GraduationAuditService::moduleBreakdown($student);

        $this->success($response, [
            'student' => [
                'id'                => (int)$student['id'],
                'regnumber'         => $student['regnumber'],
                'fname'             => $student['fname'],
                'lname'             => $student['lname'],
                'current_level'     => $student['current_level'],
                'student_state'     => $student['student_state'],
                'acc_year'          => $student['acc_year'],
                'campus'            => $student['campus'],
                'programme_level'   => $student['programme_level'],
                'graduation_status' => $student['graduation_status'],
                'graduation_date'   => $student['graduation_date'],
                'degree_class'      => $student['degree_class'],
                'started_on'        => $student['started_on'],
                'start_source'      => $student['start_source'],
                'intake_year'       => $student['intake_year'] !== null ? (int)$student['intake_year'] : null,
            ],
            'program'       => $audit['program'],
            'totals'        => $audit['totals'],
            'groups'        => $audit['groups'],
            'extra_modules' => $audit['extra_modules'],
        ], 'Completion detail fetched.');
    }

    /* ── Graduation list ─────────────────────────────────────────────────── */

    /** GET /api/graduands */
    public function list(Request $request, Response $response): never
    {
        $status  = $request->query('status')          ?? null;
        $yearId  = (int)($request->query('academic_year_id') ?? 0);
        $page    = max(1, (int)($request->query('page')     ?? 1));
        // Cap matches the page-size selector in the UI (50/100/150/200/500);
        // a lower cap here would silently return fewer rows than the page
        // claims to be showing.
        $perPage = min(500, max(10, (int)($request->query('per_page') ?? 50)));
        $offset  = ($page - 1) * $perPage;

        $where = ['1=1'];
        $args  = [];

        if ($status && in_array($status, ['waiting','pending','approved','graduated'], true)) {
            $where[] = 'g.status = ?';
            $args[]  = $status;
        }
        if ($yearId > 0) {
            $where[] = 'g.academic_year_id = ?';
            $args[]  = $yearId;
        }

        $whereStr = implode(' AND ', $where);
        $total    = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM graduands g WHERE {$whereStr}", $args
        )['n'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT g.id, g.student_id, g.academic_year_id, g.graduation_date,
                    g.degree_class, g.cgpa, g.total_credits, g.ceremony_number,
                    g.status, g.approved_by, g.approved_at, g.created_at,
                    s.regnumber, s.fname, s.lname, s.faculty, s.department,
                    y.label AS year_label,
                    u.full_name AS approved_by_name
             FROM graduands g
             LEFT JOIN `student`      s ON s.id = g.student_id
             LEFT JOIN academic_years y ON y.id = g.academic_year_id
             LEFT JOIN users          u ON u.id = g.approved_by
             WHERE {$whereStr}
             ORDER BY g.created_at DESC
             LIMIT ? OFFSET ?",
            [...$args, $perPage, $offset]
        );

        $this->success($response, [
            'data'      => $rows,
            'total'     => $total,
            'page'      => $page,
            'per_page'  => $perPage,
            'last_page' => (int)ceil($total / $perPage),
        ], 'Graduation list fetched.');
    }

    /* ── Add student to graduation list ─────────────────────────────────── */

    /** POST /api/graduands */
    public function add(Request $request, Response $response): never
    {
        $body      = $request->body();
        $studentId = (int)($body['student_id']       ?? 0);
        $yearId    = (int)($body['academic_year_id'] ?? 0) ?: null;

        if ($studentId <= 0) $this->error($response, 'student_id is required.', 422);

        // Prevent duplicate entries for the same student/year
        $existing = $this->db->fetchOne(
            "SELECT id FROM graduands WHERE student_id = ?"
            . ($yearId ? " AND academic_year_id = ?" : " AND academic_year_id IS NULL")
            . " LIMIT 1",
            $yearId ? [$studentId, $yearId] : [$studentId]
        );
        if ($existing) {
            $this->error($response, 'Student is already on the graduation list for this year.', 409);
        }

        // Resolve regnumber for eligibility check
        $row = $this->db->fetchOne(
            "SELECT regnumber FROM `student` WHERE id = ? LIMIT 1", [$studentId]
        );
        if (!$row) $this->error($response, 'Student not found.', 404);

        $elig = DegreeClassificationService::eligibleForGraduation(
            $row['regnumber'], $yearId
        );

        // Allow override via body; default to computed classification
        $degreeClass = isset($body['degree_class'])
            && in_array($body['degree_class'], ['First Class','Upper Second','Lower Second','Pass','Distinction'], true)
            ? $body['degree_class']
            : ($elig['degree_class'] ?? 'Pass');

        $this->db->execute(
            "INSERT INTO graduands
               (student_id, academic_year_id, degree_class, cgpa, total_credits)
             VALUES (?, ?, ?, ?, ?)",
            [
                $studentId, $yearId,
                $degreeClass,
                $elig['weighted_avg'],
                $elig['total_credits'],
            ]
        );

        // lastInsertId() hands back a string; SystemLogService::log() declares
        // ?int and this file is strict_types, so passing it straight through is
        // a TypeError. It never surfaced before because the INSERT above always
        // failed first — `graduands.id` had no AUTO_INCREMENT until migration 129.
        $id = (int)$this->db->lastInsertId();
        SystemLogService::log(
            'CREATE', 'STUDENTS',
            "Student #{$studentId} added to graduation list (#{$id})",
            $id, 'graduand'
        );

        $this->success($response, ['id' => $id], 'Student added to graduation list.', 201);
    }

    /* ── Approve ─────────────────────────────────────────────────────────── */

    public function approve(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->fetchGraduand($response, $id);
        if ($row['status'] !== 'pending') {
            $this->error($response, 'Only pending entries can be approved.', 409);
        }

        $this->db->execute(
            "UPDATE graduands SET status='approved', approved_by=?, approved_at=NOW() WHERE id=?",
            [$this->authUserId($request) ?: null, $id]
        );
        SystemLogService::log('APPROVE','STUDENTS',"Graduand #{$id} approved", $id,'graduand');
        $this->success($response, null, 'Graduand approved.');
    }

    /* ── Graduate ────────────────────────────────────────────────────────── */

    public function graduate(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->fetchGraduand($response, $id);
        if ($row['status'] !== 'approved') {
            $this->error($response, 'Only approved entries can be marked as graduated.', 409);
        }

        $body            = $request->body();
        $graduationDate  = $body['graduation_date']  ?? date('Y-m-d');
        $ceremonyNumber  = $body['ceremony_number']  ?? null;

        $this->db->execute(
            "UPDATE graduands
             SET status='graduated', graduation_date=?, ceremony_number=?
             WHERE id=?",
            [$graduationDate, $ceremonyNumber, $id]
        );
        SystemLogService::log('UPDATE','STUDENTS',"Graduand #{$id} marked as graduated",$id,'graduand');
        $this->success($response, null, 'Student marked as graduated.');
    }

    /* ── Defer ───────────────────────────────────────────────────────────── */

    public function defer(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $this->fetchGraduand($response, $id);

        $this->db->execute(
            "UPDATE graduands SET status='waiting' WHERE id=?", [$id]
        );
        SystemLogService::log('UPDATE','STUDENTS',"Graduand #{$id} moved back to waiting",$id,'graduand');
        $this->success($response, null, 'Graduand moved back to waiting.');
    }

    /* ── Delete ──────────────────────────────────────────────────────────── */

    public function delete(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $this->fetchGraduand($response, $id);
        $this->db->execute("DELETE FROM graduands WHERE id=?", [$id]);
        SystemLogService::log('DELETE','STUDENTS',"Graduand #{$id} removed",$id,'graduand');
        $this->success($response, null, 'Graduand removed.');
    }

    /* ── private helper ──────────────────────────────────────────────────── */

    private function fetchGraduand(Response $response, int $id): array
    {
        $row = $this->db->fetchOne(
            "SELECT id, student_id, status FROM graduands WHERE id = ? LIMIT 1", [$id]
        );
        if (!$row) $this->error($response, 'Graduand record not found.', 404);
        return $row;
    }
}
