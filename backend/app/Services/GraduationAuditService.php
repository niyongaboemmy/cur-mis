<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Graduation audit engine.
 *
 * Answers two questions the registry asks when building a graduation list:
 *
 *   1. Which students started before a given date?
 *   2. Of those, who has a mark recorded for every module their program
 *      requires — and for the ones who don't, exactly which modules are
 *      outstanding?
 *
 * ── "When did the student start?" ────────────────────────────────────────────
 *
 * There is no trustworthy start-date column. `student.registration_date` is a
 * VARCHAR holding four different formats and is empty for ~32% of rows, and
 * `student.acc_year` is the CURRENT academic year, not the intake one
 * (2011-cohort students carry acc_year 2025-2026). `started_at_cur` is a
 * yes/no flag despite the name.
 *
 * The regnumber, however, encodes the intake year in positions 5–6 —
 * `1CUR18AK05399` → 2018 — and does so for 13,601 of 13,707 students (99.2%).
 * So the regnumber leads and `registration_date` only refines it to an exact
 * day when the two agree on the year:
 *
 *   • ISO `2023-06-19 09:57:51`  → exact date. These agree with the regnumber
 *     cohort in all but 8 rows, so they are genuine registration timestamps.
 *   • Slash `9/30/2021`          → exact date. This legacy format is m/d/Y
 *     (1,540 rows have a second component > 12; only 3 have a first component
 *     > 12, which are read as d/m/Y). Slash dates disagree with the regnumber
 *     cohort 44% of the time, so a disagreement means the regnumber wins.
 *   • Anything else / empty      → 1 September of the regnumber's intake year.
 *   • No regnumber pattern       → NULL, reported as "unknown start".
 *
 * Coverage under this rule: 13,622 of 13,707 students (99.4%) resolve to a
 * date; 85 remain unknown and are excluded from date-bounded queries.
 *
 * ── "Which modules was the student supposed to take?" ────────────────────────
 *
 * Every module mapped to their program via `module_programs`, which is the
 * same source `StudentController::loadProgramCurriculum()` and the deliberation
 * screens already use. Note that this mapping is over-broad for some programs
 * (option 18, Education in English & Kinyarwanda, maps to 272 modules including
 * Biology and Chemistry), so an inflated "missing" count is a signal that the
 * curriculum needs cleaning rather than that the student failed to sit exams.
 * `curriculum_suspect` on each row flags that case for the UI.
 */
class GraduationAuditService
{
    /**
     * A program mapped to more modules than this is almost certainly the
     * result of a bulk legacy import rather than a real curriculum. Chosen
     * from the live distribution: real programs top out at 129 modules
     * (Education in Economics & Computer Science); the suspect ones all sit
     * at 272–273.
     */
    public const CURRICULUM_SUSPECT_THRESHOLD = 150;

    /** A module is passed at or above this percentage. Matches DegreeClassificationService. */
    public const PASS_MARK = 50.0;

    /**
     * How a module is bucketed from ALL of a student's attempts at it.
     *
     * 71,662 (student, module) pairs carry more than one mark row — repeat
     * sittings, resits and re-imports — and 1,723 of those hold both a pass and
     * a fail. Judging each attempt independently would put the same module in
     * two buckets at once and flag students who have already resat and passed,
     * so a module resolves to exactly one status, highest precedence first:
     *
     *   1. any attempt ≥ 50            → passed    (a pass is never revoked)
     *   2. else any exemption recorded → exempted
     *   3. else any graded attempt     → failed    (attempted, never passed)
     *   4. else any mark row at all    → pending   (sat, marks not entered)
     *   5. else                        → missing   (never taken)
     *
     *   1. any attempt ≥ 50            → passed    (a pass is never revoked)
     *   2. else any graded attempt     → failed    (attempted, never passed)
     *   3. else any exemption recorded → exempted
     *   4. else any mark row at all    → pending   (sat, marks not entered)
     *   5. else                        → missing   (never taken)
     *
     * A real recorded grade outranks an exemption flag, so a module that
     * carries both is reported as attempted rather than waived.
     * {@see moduleBucketCountsSql()} implements the same ladder in SQL so the
     * cohort list and this drill-down cannot disagree.
     */
    public const STATUS_PRECEDENCE = ['passed', 'failed', 'exempted', 'pending', 'missing'];

    /**
     * The five bucket counters for the cohort query, as set arithmetic over
     * COUNT(DISTINCT module_id). Expressed this way rather than by collapsing
     * each (student, module) to a row first because the collapse triples the
     * cost of a broad cut-off date — the counters below stay a single-level
     * aggregate while still resolving repeat sittings to one bucket each.
     *
     * With P ⊆ G (a passing attempt is a graded attempt) and R ⊇ G ∪ E:
     *   passed   = |P|
     *   failed   = |G| − |P|          modules attempted, never passed
     *   exempted = |G ∪ E| − |G|      exemptions with no grade of their own
     *   recorded = |G ∪ E|            = passed + failed + exempted
     *   pending  = |R| − |G ∪ E|      a mark row exists but carries no result
     *   missing  = expected − |R|
     *
     * @param string $modules Alias of the curriculum table (supplies module_id).
     * @param string $marks   Alias of the joined `module_marks` rows.
     */
    public static function moduleBucketCountsSql(string $modules = 'mp', string $marks = 'mm'): string
    {
        $pass    = self::PASS_MARK;
        $graded  = "COUNT(DISTINCT CASE WHEN {$marks}.percentage IS NOT NULL THEN {$modules}.module_id END)";
        $passSet = "COUNT(DISTINCT CASE WHEN {$marks}.percentage >= {$pass} THEN {$modules}.module_id END)";
        $recSet  = "COUNT(DISTINCT CASE WHEN {$marks}.percentage IS NOT NULL OR {$marks}.is_exempted = 1
                                        THEN {$modules}.module_id END)";
        $rowSet  = "COUNT(DISTINCT CASE WHEN {$marks}.id IS NOT NULL THEN {$modules}.module_id END)";

        return "COUNT(DISTINCT {$modules}.module_id) AS expected,
                {$recSet}                            AS recorded,
                {$passSet}                           AS passed,
                {$graded} - {$passSet}               AS failed,
                {$recSet} - {$graded}                AS exempted,
                {$rowSet} - {$recSet}                AS pending,
                COUNT(DISTINCT {$modules}.module_id) - {$rowSet} AS missing";
    }

    /* ── Persisted snapshot ──────────────────────────────────────────────── */

    /** Snapshot table filled by {@see rebuildSnapshot()}. */
    public const SNAPSHOT_TABLE = 'graduation_audit';

    /**
     * Recompute the whole `graduation_audit` snapshot.
     *
     * This is the expensive query the screens used to run on every request:
     * 13.7k students × their curriculum, left-joined to 292k mark rows. Doing
     * it once and reading the result back turns a ~7s page load into a
     * single-table indexed lookup.
     *
     * Driven from `module_marks`, never from student × curriculum. Expanding
     * every student against every module of their program is 1.4M rows and took
     * 53s; walking the 292k marks that actually exist and deriving the gap
     * arithmetically takes ~3s for the same answer:
     *
     *     touched  = curriculum modules with at least one mark row
     *     missing  = expected − touched          (expected comes from a
     *                                             43-row per-program summary)
     *
     * Attempts are collapsed per (student, module) first, so repeat sittings
     * resolve to one bucket and the weighted average uses the best attempt.
     *
     * Every student gets a row: the final SELECT is driven from `student` with
     * LEFT JOINs, so someone whose program has no curriculum mapped is recorded
     * with expected = 0 rather than vanishing from the cohort.
     *
     * Runs in batches so it can never outlive a request timeout. A shared host
     * that caps execution at 30s would otherwise roll the whole thing back and
     * leave the table empty — which looks exactly like "not computed yet" and
     * is why pressing Recompute appeared to do nothing on production. Callers
     * pass `$afterId` from the previous batch's `last_id` until `done`.
     *
     * `$limit = 0` processes every student in one pass (CLI / local use).
     *
     * @return array{processed:int, last_id:int, done:bool,
     *               students:int, complete:int, seconds:float}
     */
    public static function rebuildSnapshot(int $afterId = 0, int $limit = 0): array
    {
        $db    = Database::getInstance();
        $start = microtime(true);
        $table = self::SNAPSHOT_TABLE;

        // DELETE rather than TRUNCATE: TRUNCATE is DDL and would implicitly
        // commit, leaving readers looking at an empty table mid-rebuild.
        $db->beginTransaction();
        try {
            // Only the opening batch clears the table; the rest append.
            if ($afterId === 0) {
                $db->execute("DELETE FROM `{$table}`");
            }

            $db->execute(self::rebuildSql($afterId, $limit));
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        return self::rebuildStats($afterId, $limit, $start);
    }

    /**
     * The INSERT the rebuild runs, as text.
     *
     * Public so the same statement can be pasted into phpMyAdmin. An
     * environment whose PHP request budget cannot finish the rebuild — or that
     * is mid-deploy — can still populate the snapshot straight from SQL, and
     * any incompatibility shows up as a plain SQL error rather than a 500.
     */
    public static function rebuildSql(int $afterId = 0, int $limit = 0): string
    {
        $optionSql = self::optionIdSql('s');
        $startedOn = self::startedOnSql('s');
        $srcSql    = self::startSourceSql('s');
        $intakeSql = self::intakeYearSql('s');
        $pass      = self::PASS_MARK;
        $table     = self::SNAPSHOT_TABLE;

        {
            // Per-student scalars resolved once. Keeping REGEXP_SUBSTR out of
            // any JOIN condition matters: evaluated per joined row instead of
            // per student it costs an order of magnitude.
            // Bounding the student set here rather than at the end means each
            // batch also only aggregates its own students' marks.
            $bound = $limit > 0
                ? "WHERE s.id > {$afterId} ORDER BY s.id LIMIT {$limit}"
                : '';

            $studentSel = "SELECT s.id            AS student_id,
                                  s.regnumber,
                                  {$optionSql}    AS option_id,
                                  ({$startedOn})  AS started_on,
                                  ({$srcSql})     AS start_source,
                                  ({$intakeSql})  AS intake_year,
                                  s.student_state,
                                  CAST(NULLIF(REGEXP_SUBSTR(s.current_level, '^[0-9]+'), '') AS UNSIGNED)
                                                  AS current_level,
                                  s.programme_level
                           FROM `student` s {$bound}";

            return "INSERT INTO `{$table}` (
                    student_id, regnumber, option_id, started_on, start_source, intake_year,
                    student_state, current_level, programme_level,
                    expected, recorded, passed, failed, exempted, pending, missing, outstanding,
                    percent_complete, is_complete,
                    credits_expected, credits_earned, weighted_avg, computed_at
                 )
                 SELECT
                    stu.student_id, stu.regnumber, stu.option_id,
                    stu.started_on, stu.start_source, stu.intake_year,
                    stu.student_state, stu.current_level, stu.programme_level,

                    COALESCE(cur.n_modules, 0)                       AS expected,
                    COALESCE(mk.passed, 0) + COALESCE(mk.failed, 0)
                        + COALESCE(mk.exempted, 0)                   AS recorded,
                    COALESCE(mk.passed, 0)                           AS passed,
                    COALESCE(mk.failed, 0)                           AS failed,
                    COALESCE(mk.exempted, 0)                         AS exempted,
                    COALESCE(mk.pending, 0)                          AS pending,
                    -- Every curriculum module the student has no mark row for.
                    COALESCE(cur.n_modules, 0) - COALESCE(mk.touched, 0) AS missing,
                    COALESCE(cur.n_modules, 0) - COALESCE(mk.touched, 0)
                        + COALESCE(mk.pending, 0)                    AS outstanding,

                    CASE WHEN COALESCE(cur.n_modules, 0) > 0
                         THEN ROUND((COALESCE(mk.passed, 0) + COALESCE(mk.failed, 0)
                                     + COALESCE(mk.exempted, 0)) / cur.n_modules * 100, 2)
                    END                                              AS percent_complete,
                    CASE WHEN COALESCE(cur.n_modules, 0) > 0
                          AND cur.n_modules - COALESCE(mk.touched, 0) = 0
                          AND COALESCE(mk.pending, 0) = 0
                         THEN 1 ELSE 0 END                           AS is_complete,

                    COALESCE(cur.credits, 0)                         AS credits_expected,
                    COALESCE(mk.credits_earned, 0)                   AS credits_earned,
                    mk.weighted_avg                                  AS weighted_avg,
                    NOW()                                            AS computed_at

                 FROM ({$studentSel}) stu

                 -- 43 rows: what each program requires. Turns \"which modules is
                 -- this student missing\" into subtraction instead of a join.
                 LEFT JOIN (
                    SELECT mp.option_id,
                           COUNT(*)               AS n_modules,
                           SUM(m.module_credits)  AS credits
                    FROM `module_programs` mp
                    JOIN `modules` m ON m.module_id = mp.module_id
                    GROUP BY mp.option_id
                 ) cur ON cur.option_id = stu.option_id

                 -- What the student actually has, restricted to their own
                 -- curriculum and collapsed to one row per module first.
                 LEFT JOIN (
                    SELECT pm.student_id,
                           COUNT(*)                                            AS touched,
                           SUM(pm.f_passed)                                    AS passed,
                           SUM(NOT pm.f_passed AND pm.f_graded)                AS failed,
                           SUM(NOT pm.f_passed AND NOT pm.f_graded
                               AND pm.f_exempted)                              AS exempted,
                           SUM(NOT pm.f_passed AND NOT pm.f_graded
                               AND NOT pm.f_exempted)                          AS pending,
                           SUM(CASE WHEN pm.f_passed OR pm.f_exempted
                                    THEN pm.module_credits ELSE 0 END)         AS credits_earned,
                           -- Credit-weighted mean of the best attempt at each
                           -- graded module. Modules never sat are excluded
                           -- rather than counted as zero, which would punish a
                           -- part-finished record for marks not yet entered.
                           CASE WHEN SUM(CASE WHEN pm.f_graded THEN pm.module_credits ELSE 0 END) > 0
                                THEN ROUND(
                                       SUM(CASE WHEN pm.f_graded
                                                THEN pm.best_pct * pm.module_credits ELSE 0 END)
                                     / SUM(CASE WHEN pm.f_graded THEN pm.module_credits ELSE 0 END), 2)
                           END                                                 AS weighted_avg
                    FROM (
                       SELECT st.student_id, mp.module_id, m.module_credits,
                              MAX(mm.percentage >= {$pass})    AS f_passed,
                              MAX(mm.is_exempted = 1)          AS f_exempted,
                              MAX(mm.percentage IS NOT NULL)   AS f_graded,
                              MAX(mm.percentage)               AS best_pct
                       FROM ({$studentSel}) st
                       JOIN `module_marks`    mm ON mm.student_regnumber = st.regnumber
                       JOIN `module_programs` mp ON mp.module_id = mm.module_id
                                                AND mp.option_id = st.option_id
                       JOIN `modules`         m  ON m.module_id  = mp.module_id
                       GROUP BY st.student_id, mp.module_id, m.module_credits
                    ) pm
                    GROUP BY pm.student_id
                 ) mk ON mk.student_id = stu.student_id
                 ON DUPLICATE KEY UPDATE
                    regnumber = VALUES(regnumber), option_id = VALUES(option_id),
                    started_on = VALUES(started_on), start_source = VALUES(start_source),
                    intake_year = VALUES(intake_year), student_state = VALUES(student_state),
                    current_level = VALUES(current_level), programme_level = VALUES(programme_level),
                    expected = VALUES(expected), recorded = VALUES(recorded),
                    passed = VALUES(passed), failed = VALUES(failed),
                    exempted = VALUES(exempted), pending = VALUES(pending),
                    missing = VALUES(missing), outstanding = VALUES(outstanding),
                    percent_complete = VALUES(percent_complete), is_complete = VALUES(is_complete),
                    credits_expected = VALUES(credits_expected),
                    credits_earned = VALUES(credits_earned),
                    weighted_avg = VALUES(weighted_avg), computed_at = VALUES(computed_at)";
        }
    }

    /**
     * Cursor and totals after a batch.
     *
     * @return array{processed:int, last_id:int, done:bool,
     *               students:int, complete:int, seconds:float}
     */
    private static function rebuildStats(int $afterId, int $limit, float $start): array
    {
        $db    = Database::getInstance();
        $table = self::SNAPSHOT_TABLE;

        // How far this batch got. Reading it back from `student` rather than
        // from the snapshot keeps the cursor correct even when a batch writes
        // nothing (it never does today, but the cursor must not stall).
        $processed = 0;
        $lastId    = $afterId;
        if ($limit > 0) {
            $row = $db->fetchOne(
                "SELECT COUNT(*) AS n, COALESCE(MAX(id), ?) AS last_id
                 FROM (SELECT id FROM `student` WHERE id > ? ORDER BY id LIMIT {$limit}) b",
                [$afterId, $afterId]
            ) ?: [];
            $processed = (int)($row['n'] ?? 0);
            $lastId    = (int)($row['last_id'] ?? $afterId);
        }

        $counts = $db->fetchOne(
            "SELECT COUNT(*) AS students, SUM(is_complete = 1) AS complete FROM `{$table}`"
        ) ?: ['students' => 0, 'complete' => 0];

        return [
            'processed' => $limit > 0 ? $processed : (int)($counts['students'] ?? 0),
            'last_id'   => $lastId,
            'done'      => $limit === 0 || $processed < $limit,
            'students'  => (int)($counts['students'] ?? 0),
            'complete'  => (int)($counts['complete'] ?? 0),
            'seconds'   => round(microtime(true) - $start, 2),
        ];
    }

    /** When the snapshot was last rebuilt, or null when it has never been. */
    public static function snapshotComputedAt(): ?string
    {
        $row = Database::getInstance()->fetchOne(
            'SELECT MAX(computed_at) AS at FROM `' . self::SNAPSHOT_TABLE . '`'
        );

        return $row['at'] ?? null;
    }

    /**
     * Whether the snapshot table exists at all.
     *
     * Deployment runs on push but migrations are a separate manual workflow, so
     * new code can reach an environment whose schema has not caught up. Without
     * this check every read here dies with a bare 1146 and the UI shows an empty
     * list, which reads as "no students match" rather than "this environment is
     * missing a migration".
     */
    public static function snapshotExists(): bool
    {
        $row = Database::getInstance()->fetchOne(
            "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
            [self::SNAPSHOT_TABLE]
        );

        return (int)($row['n'] ?? 0) > 0;
    }

    /* ── SQL fragments ───────────────────────────────────────────────────── */

    /**
     * The student's program id, as an int, from the VARCHAR `std_option`.
     *
     * A plain `CAST(... AS UNSIGNED)` is not safe here: 126 rows hold the
     * literal string `'null'` and one holds `'18_OP'`, and casting either
     * raises error 1292 under strict mode as soon as the value is written to a
     * column (harmless warning in a bare SELECT, fatal in INSERT … SELECT).
     * Taking the leading digits instead never errors and matches how PHP's
     * `(int)` cast reads the same values elsewhere in the app — `'18_OP'` → 18,
     * `'null'` and `''` → NULL.
     */
    public static function optionIdSql(string $a = 's'): string
    {
        return "CAST(NULLIF(REGEXP_SUBSTR({$a}.std_option, '^[0-9]+'), '') AS UNSIGNED)";
    }

    /** Intake year decoded from the regnumber (`1CUR18AK05399` → 2018), else NULL. */
    public static function intakeYearSql(string $a = 's'): string
    {
        return "CASE WHEN {$a}.regnumber REGEXP '^[0-9]CUR[0-9]{2}'
                     THEN CAST(CONCAT('20', SUBSTRING({$a}.regnumber, 5, 2)) AS UNSIGNED)
                END";
    }

    /**
     * Derived start date. See the class docblock for why the regnumber leads
     * and `registration_date` only refines. Returns a DATE or NULL.
     */
    public static function startedOnSql(string $a = 's'): string
    {
        $iso   = self::isoMatchSql($a);
        $slash = self::slashMatchSql($a);

        return "CASE
                  WHEN {$iso}
                    THEN CAST(STR_TO_DATE(LEFT({$a}.registration_date, 10), '%Y-%m-%d') AS DATE)
                  WHEN {$slash}
                    THEN CAST(STR_TO_DATE(
                           {$a}.registration_date,
                           IF(CAST(SUBSTRING_INDEX({$a}.registration_date, '/', 1) AS UNSIGNED) > 12,
                              '%d/%m/%Y', '%m/%d/%Y')
                         ) AS DATE)
                  WHEN {$a}.regnumber REGEXP '^[0-9]CUR[0-9]{2}'
                    THEN CAST(STR_TO_DATE(
                           CONCAT('20', SUBSTRING({$a}.regnumber, 5, 2), '-09-01'), '%Y-%m-%d'
                         ) AS DATE)
                END";
    }

    /** Where the start date came from — shown in the UI so staff can judge it. */
    public static function startSourceSql(string $a = 's'): string
    {
        $iso   = self::isoMatchSql($a);
        $slash = self::slashMatchSql($a);

        return "CASE
                  WHEN {$iso} OR {$slash}                        THEN 'registration_date'
                  WHEN {$a}.regnumber REGEXP '^[0-9]CUR[0-9]{2}' THEN 'regnumber'
                  ELSE 'unknown'
                END";
    }

    /** ISO `registration_date` that agrees with the regnumber cohort year. */
    private static function isoMatchSql(string $a): string
    {
        return "({$a}.registration_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                 AND ({$a}.regnumber NOT REGEXP '^[0-9]CUR[0-9]{2}'
                      OR LEFT({$a}.registration_date, 4) = CONCAT('20', SUBSTRING({$a}.regnumber, 5, 2))))";
    }

    /** Slash `registration_date` that agrees with the regnumber cohort year. */
    private static function slashMatchSql(string $a): string
    {
        return "({$a}.registration_date REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
                 AND ({$a}.regnumber NOT REGEXP '^[0-9]CUR[0-9]{2}'
                      OR SUBSTRING_INDEX({$a}.registration_date, '/', -1) = CONCAT('20', SUBSTRING({$a}.regnumber, 5, 2))))";
    }

    /* ── Per-student module breakdown ────────────────────────────────────── */

    /**
     * Every curriculum module for one student, grouped by level, each tagged
     * with its audit status. This is the drill-down behind a row in the
     * completion list.
     *
     * Status per module:
     *   passed   — latest mark ≥ 50
     *   failed   — latest mark < 50
     *   exempted — an exemption row was recorded
     *   pending  — a mark row exists but no percentage has been entered
     *   missing  — no mark row at all
     *
     * @param  array<string,mixed> $student  A `student` row.
     * @return array{
     *   program: array<string,mixed>|null,
     *   totals:  array<string,int>,
     *   groups:  array<int,array<string,mixed>>,
     *   extra_modules: array<int,array<string,mixed>>
     * }
     */
    public static function moduleBreakdown(array $student): array
    {
        $db        = Database::getInstance();
        $optionId  = (int)($student['std_option'] ?? 0);
        $regnumber = trim((string)($student['regnumber'] ?? ''));

        $empty = [
            'program'       => null,
            'totals'        => self::emptyTotals(),
            'groups'        => [],
            'extra_modules' => [],
        ];

        if ($optionId <= 0) {
            return $empty;
        }

        $program = $db->fetchOne(
            "SELECT o.id, o.name, o.title, o.code, o.acro, o.department_id
             FROM `options` o WHERE o.id = ? LIMIT 1",
            [$optionId]
        );
        if (!$program) {
            return $empty;
        }

        // Curriculum for the program. `module_levels` lets a shared core module
        // appear under each level it belongs to; fall back to the legacy
        // single-level column on `modules` when no mapping rows exist.
        $curriculum = $db->fetchAll(
            "SELECT m.module_id, m.module_code, m.module_name, m.module_credits,
                    mp.module_order,
                    COALESCE(ml.level_id, m.level)      AS level_id,
                    COALESCE(lvl.name, lvl_legacy.name) AS level_name
             FROM `module_programs` mp
             JOIN `modules` m              ON m.module_id  = mp.module_id
             LEFT JOIN `module_levels` ml  ON ml.module_id = m.module_id
             LEFT JOIN `levels` lvl        ON lvl.id       = ml.level_id
             LEFT JOIN `levels` lvl_legacy ON lvl_legacy.id = m.level
             WHERE mp.option_id = ?
             ORDER BY level_id ASC, mp.module_order ASC, m.module_code ASC",
            [$optionId]
        );

        // Every attempt per module, newest first. All of them are needed because
        // the status ladder is evaluated across attempts, not per row — see
        // STATUS_PRECEDENCE.
        $attemptsByModule = [];
        if ($regnumber !== '') {
            $markRows = $db->fetchAll(
                "SELECT mm.module_id, mm.percentage, mm.grade, mm.decision,
                        mm.total, mm.is_exempted, mm.exemption_reason, mm.status,
                        mm.academic_term_id, t.label AS term_label,
                        y.label AS year_label, mm.updated_at
                 FROM `module_marks` mm
                 LEFT JOIN `academic_terms` t ON t.id = mm.academic_term_id
                 LEFT JOIN `academic_years` y ON y.id = t.academic_year_id
                 WHERE mm.student_regnumber = ?
                 ORDER BY y.start_date DESC, t.start_date DESC, mm.updated_at DESC",
                [$regnumber]
            );
            foreach ($markRows as $r) {
                $attemptsByModule[(int)$r['module_id']][] = $r;
            }
        }

        $totals   = self::emptyTotals();
        $byLevel  = [];
        $seenInCurriculum = [];

        foreach ($curriculum as $row) {
            $moduleId = (int)$row['module_id'];

            $attempts = $attemptsByModule[$moduleId] ?? [];
            $status   = self::classifyModule($attempts);
            $mark     = self::representativeAttempt($attempts, $status);

            // A module mapped to several levels via `module_levels` yields one
            // curriculum row per level, and is shown under each of them — but it
            // is still a single module. Counting it once keeps these totals
            // equal to the COUNT(DISTINCT module_id) the cohort list reports.
            if (!isset($seenInCurriculum[$moduleId])) {
                $seenInCurriculum[$moduleId] = true;

                $totals['expected']++;
                $totals[$status]++;
                if ($status !== 'missing' && $status !== 'pending') {
                    $totals['recorded']++;
                    $totals['credits_recorded'] += (int)($row['module_credits'] ?? 0);
                }
                $totals['credits_expected'] += (int)($row['module_credits'] ?? 0);
            }

            $levelId  = $row['level_id'] !== null ? (int)$row['level_id'] : 0;
            $byLevel[$levelId] ??= [
                'level_id'   => $levelId ?: null,
                'level_name' => $row['level_name'] ?? ($levelId ? "Level {$levelId}" : 'Unassigned'),
                'modules'    => [],
            ];

            $byLevel[$levelId]['modules'][] = [
                'module_id'      => $moduleId,
                'module_code'    => trim((string)($row['module_code'] ?? '')),
                'module_name'    => trim((string)($row['module_name'] ?? '')),
                'module_credits' => (int)($row['module_credits'] ?? 0),
                'module_order'   => $row['module_order'] !== null ? (int)$row['module_order'] : null,
                'status'         => $status,
                'attempts'       => count($attempts),
                'percentage'     => $mark && $mark['percentage'] !== null ? (float)$mark['percentage'] : null,
                'grade'          => $mark['grade']            ?? null,
                'decision'       => $mark['decision']         ?? null,
                'mark_status'    => $mark['status']           ?? null,
                'term_label'     => $mark['term_label']       ?? null,
                'year_label'     => $mark['year_label']       ?? null,
                // When the mark was last touched. The audit UI shows this
                // instead of the term label — every legacy mark carries the
                // same 'Legacy (imported marks)' term, so that column said
                // nothing, while the edit date tells the registry whether a
                // result is current.
                'updated_at'     => $mark['updated_at']       ?? null,
                'exemption_reason' => $mark['exemption_reason'] ?? null,
            ];
        }

        // Marks that sit outside the program's curriculum. Usually a sign the
        // student transferred program or that the mapping is incomplete —
        // either way the registry needs to see them, since they are real marks
        // that the completion count above silently ignores.
        $extra = [];
        foreach ($attemptsByModule as $moduleId => $attempts) {
            if (isset($seenInCurriculum[$moduleId])) {
                continue;
            }
            $status = self::classifyModule($attempts);
            $mark   = self::representativeAttempt($attempts, $status);
            $extra[] = [
                'module_id'   => $moduleId,
                'status'      => $status,
                'attempts'    => count($attempts),
                'percentage'  => $mark && $mark['percentage'] !== null ? (float)$mark['percentage'] : null,
                'grade'       => $mark['grade']      ?? null,
                'term_label'  => $mark['term_label'] ?? null,
                'year_label'  => $mark['year_label'] ?? null,
                'updated_at'  => $mark['updated_at'] ?? null,
            ];
        }
        if ($extra) {
            $ids  = array_column($extra, 'module_id');
            $ph   = implode(',', array_fill(0, count($ids), '?'));
            $meta = $db->fetchAll(
                "SELECT module_id, module_code, module_name, module_credits
                 FROM `modules` WHERE module_id IN ({$ph})",
                $ids
            );
            $metaById = [];
            foreach ($meta as $m) {
                $metaById[(int)$m['module_id']] = $m;
            }
            foreach ($extra as &$e) {
                $m = $metaById[$e['module_id']] ?? null;
                $e['module_code']    = trim((string)($m['module_code'] ?? ''));
                $e['module_name']    = trim((string)($m['module_name'] ?? ''));
                $e['module_credits'] = (int)($m['module_credits'] ?? 0);
            }
            unset($e);
            usort($extra, static fn ($x, $y) => strcmp($x['module_code'], $y['module_code']));
        }
        $totals['extra'] = count($extra);

        ksort($byLevel);

        return [
            'program' => [
                'id'            => (int)$program['id'],
                'name'          => $program['name']  ?? null,
                'title'         => $program['title'] ?? null,
                'code'          => $program['code']  ?? null,
                'acro'          => $program['acro']  ?? null,
                'department_id' => $program['department_id'] !== null ? (int)$program['department_id'] : null,
                'curriculum_suspect' => $totals['expected'] > self::CURRICULUM_SUSPECT_THRESHOLD,
            ],
            'totals'        => $totals,
            'groups'        => array_values($byLevel),
            'extra_modules' => $extra,
        ];
    }

    /**
     * Bucket one module from every attempt the student made at it.
     * The PHP twin of {@see moduleStatusFlagsSql()} — see STATUS_PRECEDENCE.
     *
     * @param array<int,array<string,mixed>> $attempts
     */
    private static function classifyModule(array $attempts): string
    {
        if (!$attempts) {
            return 'missing';
        }

        $exempted = false;
        $graded   = false;
        foreach ($attempts as $a) {
            if ($a['percentage'] !== null) {
                if ((float)$a['percentage'] >= self::PASS_MARK) {
                    return 'passed';
                }
                $graded = true;
            }
            if ((int)($a['is_exempted'] ?? 0) === 1) {
                $exempted = true;
            }
        }

        if ($graded)   return 'failed';
        if ($exempted) return 'exempted';

        return 'pending';
    }

    /**
     * The attempt worth showing next to a module: the passing one when the
     * student passed (that is the result that stands), otherwise the most
     * recent. Attempts arrive newest-first.
     *
     * @param array<int,array<string,mixed>> $attempts
     */
    private static function representativeAttempt(array $attempts, string $status): ?array
    {
        if (!$attempts) {
            return null;
        }
        if ($status !== 'passed') {
            return $attempts[0];
        }

        $best = null;
        foreach ($attempts as $a) {
            if ($a['percentage'] === null) {
                continue;
            }
            if ($best === null || (float)$a['percentage'] > (float)$best['percentage']) {
                $best = $a;
            }
        }

        return $best ?? $attempts[0];
    }

    /** @return array<string,int> */
    private static function emptyTotals(): array
    {
        return [
            'expected'         => 0,
            'recorded'         => 0,
            'passed'           => 0,
            'failed'           => 0,
            'exempted'         => 0,
            'pending'          => 0,
            'missing'          => 0,
            'extra'            => 0,
            'credits_expected' => 0,
            'credits_recorded' => 0,
        ];
    }
}
