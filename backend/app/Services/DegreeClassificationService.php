<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Degree classification engine.
 *
 * Two distinct questions live here, and they are not the same question:
 *
 *  1. {@see classify()} — what class does a *cumulative weighted average*
 *     imply? A single number in, a band out. This is what the graduand roster
 *     offers as a suggestion when a registrar is filling a ceremony list.
 *
 *  2. {@see honours()} — what class do the CUR regulations actually award?
 *     That is not a function of the average at all. Per the regulations, a
 *     class is decided on the *final-level modules* by three tests together:
 *     a credit-weighted majority at or above the class threshold, a floor no
 *     module may fall below, and the Project meeting the threshold in its own
 *     right. A student averaging 71% with one 58% cannot hold a 2i, however
 *     the average reads — which is exactly the case (1) alone gets wrong.
 *
 * The transcript and the degree documents print (2). (1) survives because the
 * roster and certificate screens are built around it and a stored
 * `degree_class` is ultimately the registrar's to set.
 *
 * ── The regulations, as implemented by {@see honours()} ───────────────────
 * "More than half the modules" means modules carrying more than half of the
 * available credit, weighted by the credit rating of the modules.
 *
 *   First Class (1st)          ≥ 80% over > half the credit, incl. Project,
 *                              and no mark below 70%.
 *   Upper Second (2i)          ≥ 70% over > half the credit, incl. Project,
 *                              and no mark below 60%.
 *   Lower Second (2ii)         ≥ 60% over > half the credit, incl. Project,
 *                              and no mark below 50%.
 *   Third Class (3)            ≥ 50% in every module, incl. Project. May be
 *                              awarded with marginally failed modules (45–49%)
 *                              across up to 20 credits, provided the Project
 *                              itself is at least 50%.
 *
 * ── Which modules count ──────────────────────────────────────────────────
 * The regulations name Level 8 Semester 6 and Level 8 Semesters 7 & 8 — the
 * final year and a half. `modules` records a level of study, not a semester,
 * and level L covers semesters 2L−1 and 2L, so semester 6 lands inside level 3
 * and semesters 7 & 8 are level 4. {@see FINAL_LEVELS} is therefore levels 3
 * and 4, which is the closest the data supports; it sweeps in semester 5 as
 * well, and that is stated in the returned `caveats` rather than hidden. Set
 * `DEGREE_CLASSIFICATION_LEVELS` (e.g. "4" or "3,4") to narrow it for a
 * programme of a different shape.
 */
class DegreeClassificationService
{
    /**
     * Levels of study whose modules decide the class. See the class docblock
     * for why this is 3 and 4 rather than a semester list.
     */
    private const FINAL_LEVELS = [3, 4];

    /** A module at or above this counts as passed. */
    private const PASS_MARK = 50.0;

    /** Marks in [45, 50) are "marginal fails" a Third may be awarded despite. */
    private const MARGINAL_FAIL_MIN = 45.0;

    /** …across at most this many credits. */
    private const MARGINAL_FAIL_MAX_CREDITS = 20;

    /**
     * The honours ladder: threshold a credit-majority must reach, and the floor
     * no single module may fall below. Ordered best first — the first class
     * whose tests all pass is the one awarded.
     *
     * `class` reuses the vocabulary `graduands.degree_class` already stores, so
     * an honours result can be written straight into the roster; `label` is the
     * full wording the transcript and the degree certificate print.
     */
    private const HONOURS = [
        ['code' => '1st', 'class' => 'First Class',  'label' => 'First Class Honours (1st)',
         'threshold' => 80.0, 'floor' => 70.0],
        ['code' => '2i',  'class' => 'Upper Second', 'label' => 'Second Class Honours, Upper Division (2i)',
         'threshold' => 70.0, 'floor' => 60.0],
        ['code' => '2ii', 'class' => 'Lower Second', 'label' => 'Second Class Honours, Lower Division (2ii)',
         'threshold' => 60.0, 'floor' => 50.0],
    ];

    /** Names/codes that identify the Project module the regulations single out. */
    private const PROJECT_PATTERN = '/\b(project|dissertation|thesis|m[ée]moire)\b/iu';

    /** @var array<string, float> Minimum weighted average for each class (descending order). */
    private static array $bands = [
        'First Class'   => 80.0,
        'Upper Second'  => 70.0,
        'Lower Second'  => 60.0,
        'Pass'          => 50.0,
    ];

    /**
     * Map a weighted average percentage to a degree class string.
     *
     * @throws \InvalidArgumentException if the average is below the Pass threshold.
     */
    public static function classify(float $weightedAverage): string
    {
        foreach (self::$bands as $class => $threshold) {
            if ($weightedAverage >= $threshold) {
                return $class;
            }
        }
        throw new \InvalidArgumentException(
            "Weighted average {$weightedAverage}% is below the minimum Pass threshold (50%)."
        );
    }

    /**
     * Same bands as {@see classify()}, but returns null instead of throwing
     * when the average falls below the Pass threshold. For callers that are
     * offering a suggestion rather than asserting an outcome — a sub-50
     * average simply has no class to suggest.
     */
    public static function classifyOrNull(float $weightedAverage): ?string
    {
        try {
            return self::classify($weightedAverage);
        } catch (\InvalidArgumentException) {
            return null;
        }
    }

    /**
     * Check whether a student is eligible to graduate and compute their
     * classification.
     *
     * A student is eligible when:
     *   - They have at least one confirmed/submitted mark recorded.
     *   - They have zero failed modules (percentage < 50).
     *   - Their weighted average is ≥ 50 (Pass threshold).
     *
     * @return array{
     *   eligible: bool,
     *   weighted_avg: float|null,
     *   total_credits: int,
     *   total_credit_points: float,
     *   degree_class: string|null,
     *   passed: int,
     *   failed: int,
     *   modules: int
     * }
     */
    public static function eligibleForGraduation(string $regnumber, ?int $academicYearId = null): array
    {
        $db   = Database::getInstance();
        $args = [$regnumber];

        $yearFilter = '';
        if ($academicYearId !== null && $academicYearId > 0) {
            $yearFilter = ' AND t.academic_year_id = ?';
            $args[]     = $academicYearId;
        }

        $rows = $db->fetchAll(
            "SELECT mm.percentage, m.module_credits
             FROM module_marks mm
             LEFT JOIN modules       m ON m.module_id = mm.module_id
             LEFT JOIN academic_terms t ON t.id        = mm.academic_term_id
             WHERE mm.student_regnumber = ?
               AND mm.percentage IS NOT NULL
               AND mm.is_exempted = 0
               $yearFilter",
            $args
        );

        if (empty($rows)) {
            return [
                'eligible'            => false,
                'weighted_avg'        => null,
                'total_credits'       => 0,
                'total_credit_points' => 0.0,
                'degree_class'        => null,
                'passed'              => 0,
                'failed'              => 0,
                'modules'             => 0,
            ];
        }

        $totalCredits      = 0;
        $totalCreditPoints = 0.0;
        $passed            = 0;
        $failed            = 0;

        foreach ($rows as $r) {
            $credits = (int)($r['module_credits'] ?? 0);
            $pct     = (float)$r['percentage'];

            $totalCredits      += $credits;
            $totalCreditPoints += $credits * $pct;

            if ($pct >= 50.0) {
                $passed++;
            } else {
                $failed++;
            }
        }

        $weightedAvg = $totalCredits > 0
            ? round($totalCreditPoints / $totalCredits, 2)
            : null;

        $eligible    = $failed === 0 && $weightedAvg !== null && $weightedAvg >= 50.0;
        $degreeClass = null;

        if ($eligible && $weightedAvg !== null) {
            try {
                $degreeClass = self::classify($weightedAvg);
            } catch (\InvalidArgumentException) {
                $eligible = false;
            }
        }

        return [
            'eligible'            => $eligible,
            'weighted_avg'        => $weightedAvg,
            'total_credits'       => $totalCredits,
            'total_credit_points' => $totalCreditPoints,
            'degree_class'        => $degreeClass,
            'passed'              => $passed,
            'failed'              => $failed,
            'modules'             => count($rows),
        ];
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Honours classification — the regulations, applied to the marks
     * ═══════════════════════════════════════════════════════════════════ */

    /**
     * Classify a transcript under the CUR honours regulations.
     *
     * Pure: it is handed the rows the transcript already loaded rather than
     * going back to the database, so the screen, the PDF and the API can never
     * disagree about a student's class.
     *
     * Each row needs `percentage`, `module_credits`, `level` and, to find the
     * Project, `module_name` / `module_code` — the shape
     * `ModuleMarksController::loadTranscriptRows()` returns.
     *
     * @param  array<int,array<string,mixed>> $rows every graded module, any level
     * @return array{
     *   code: string|null, class: string|null, label: string,
     *   awarded: bool, reason: string|null, caveats: array<int,string>,
     *   levels: array<int,int>, modules: int, credits: int,
     *   qualifying_credits: float, weighted_average: float|null,
     *   lowest_mark: float|null, project: array<string,mixed>|null
     * }
     */
    public static function honours(array $rows): array
    {
        $levels    = self::finalLevels();
        $qualifying = [];
        foreach ($rows as $r) {
            $pct = self::pct($r['percentage'] ?? null);
            if ($pct === null) continue;
            $lvl = $r['level'] ?? null;
            if ($lvl === null || $lvl === '' || !in_array((int)$lvl, $levels, true)) continue;
            $qualifying[] = [
                'pct'     => $pct,
                'credits' => (int)($r['module_credits'] ?? 0),
                'name'    => trim((string)($r['module_name'] ?? '')),
                'code'    => trim((string)($r['module_code'] ?? '')),
                'level'   => (int)$lvl,
            ];
        }

        $base = [
            'code' => null, 'class' => null, 'label' => 'Not classified',
            'awarded' => false, 'reason' => null, 'caveats' => [],
            'levels' => $levels, 'modules' => count($qualifying), 'credits' => 0,
            'qualifying_credits' => 0.0, 'weighted_average' => null,
            'lowest_mark' => null, 'project' => null,
        ];

        if (!$qualifying) {
            $lvlText = implode(' and ', array_map('strval', $levels));
            return array_merge($base, [
                'reason' => "No marks are recorded at level {$lvlText}, so the final-year rules "
                          . 'cannot be applied yet.',
            ]);
        }

        $totalCredits = 0;
        $points       = 0.0;
        $lowest       = null;
        foreach ($qualifying as $q) {
            $totalCredits += $q['credits'];
            $points       += $q['credits'] * $q['pct'];
            $lowest        = $lowest === null ? $q['pct'] : min($lowest, $q['pct']);
        }
        $half = $totalCredits / 2;

        $project = self::findProject($qualifying);
        $result  = array_merge($base, [
            'credits'          => $totalCredits,
            'weighted_average' => $totalCredits > 0 ? round($points / $totalCredits, 2) : null,
            'lowest_mark'      => $lowest,
            'project'          => $project === null ? null : [
                'code' => $project['code'], 'name' => $project['name'],
                'mark' => $project['pct'], 'credits' => $project['credits'],
            ],
        ]);

        // A record with no identifiable Project cannot be checked against the
        // "including the Project" condition. The class is still computed — a
        // legacy import routinely lacks the module — but the gap is stated so
        // the registrar knows what was and was not verified.
        if ($project === null) {
            $result['caveats'][] = 'No Project module was found in the final-level record, '
                . 'so the "including the Project" condition could not be verified.';
        }
        // Only worth saying when a level-3 module is actually in the set — a
        // record that is entirely level 4 has no semester-5 ambiguity to warn
        // about, and a caveat nobody needs is a caveat nobody reads.
        $hasLevel3 = false;
        foreach ($qualifying as $q) { if ($q['level'] === 3) { $hasLevel3 = true; break; } }
        if ($hasLevel3) {
            $result['caveats'][] = 'Level 3 covers semesters 5 and 6; the record does not '
                . 'distinguish them, so semester 5 modules are included in this assessment.';
        }

        foreach (self::HONOURS as $band) {
            $atOrAbove = 0.0;
            foreach ($qualifying as $q) {
                if ($q['pct'] >= $band['threshold']) $atOrAbove += $q['credits'];
            }
            $majority     = $atOrAbove > $half;
            $floorHeld    = $lowest !== null && $lowest >= $band['floor'];
            $projectHeld  = $project === null || $project['pct'] >= $band['threshold'];

            if ($majority && $floorHeld && $projectHeld) {
                return array_merge($result, [
                    'code' => $band['code'], 'class' => $band['class'], 'label' => $band['label'],
                    'awarded' => true, 'qualifying_credits' => $atOrAbove,
                ]);
            }
        }

        // Third Class — every module passed, or marginal fails inside the
        // 20-credit allowance with the Project itself passed.
        $marginalCredits = 0;
        $hardFail        = false;
        foreach ($qualifying as $q) {
            if ($q['pct'] >= self::PASS_MARK) continue;
            if ($q['pct'] >= self::MARGINAL_FAIL_MIN) { $marginalCredits += $q['credits']; continue; }
            $hardFail = true;
        }
        $projectPassed = $project === null || $project['pct'] >= self::PASS_MARK;

        if (!$hardFail && $marginalCredits <= self::MARGINAL_FAIL_MAX_CREDITS && $projectPassed) {
            $third = [
                'code' => '3', 'class' => 'Pass', 'label' => 'Third Class Honours (3)',
                'awarded' => true, 'qualifying_credits' => (float)$totalCredits,
            ];
            if ($marginalCredits > 0) {
                $allowance = self::MARGINAL_FAIL_MAX_CREDITS;
                $result['caveats'][] = 'Awarded with marginally failed modules (45–49%) across '
                    . "{$marginalCredits} credits, within the {$allowance} the regulations allow.";
            }
            return array_merge($result, $third);
        }

        $result['reason'] = $hardFail
            ? 'One or more final-level modules are below 45%, which no class allows.'
            : (!$projectPassed
                ? 'The Project is below 50%, which every class requires.'
                : "Marginally failed modules span {$marginalCredits} credits, more than the "
                  . self::MARGINAL_FAIL_MAX_CREDITS . ' the regulations allow for a Third.');
        return $result;
    }

    /**
     * Same rules, fetched for one student — for callers that hold a regnumber
     * rather than a loaded transcript.
     *
     * @return array<string,mixed> the shape {@see honours()} returns
     */
    public static function honoursFor(string $regnumber): array
    {
        $rows = Database::getInstance()->fetchAll(
            "SELECT mm.percentage, m.module_credits, m.level, m.module_code, m.module_name
             FROM module_marks mm
             LEFT JOIN modules m ON m.module_id = mm.module_id
             WHERE mm.student_regnumber = ?
               AND mm.superseded = 0
               AND mm.percentage IS NOT NULL",
            [$regnumber]
        );
        return self::honours($rows);
    }

    /**
     * {@see honoursFor()} for a whole page of students in one query.
     *
     * The roster classifies every row it lists; done one student at a time that
     * is a query per row, and the page is fifty rows deep. One IN() and a group
     * in PHP costs the same as a single student's lookup.
     *
     * @param  array<int,string> $regnumbers
     * @return array<string,array<string,mixed>> regnumber → the honours result
     */
    public static function honoursForMany(array $regnumbers): array
    {
        $regs = array_values(array_unique(array_filter(array_map(
            static fn ($r) => trim((string)$r),
            $regnumbers
        ), static fn (string $r) => $r !== '')));
        if (!$regs) return [];

        $ph   = implode(',', array_fill(0, count($regs), '?'));
        $rows = Database::getInstance()->fetchAll(
            "SELECT mm.student_regnumber, mm.percentage,
                    m.module_credits, m.level, m.module_code, m.module_name
             FROM module_marks mm
             LEFT JOIN modules m ON m.module_id = mm.module_id
             WHERE mm.student_regnumber IN ({$ph})
               AND mm.superseded = 0
               AND mm.percentage IS NOT NULL",
            $regs
        );

        $byStudent = [];
        foreach ($rows as $r) {
            $byStudent[(string)$r['student_regnumber']][] = $r;
        }

        $out = [];
        foreach ($regs as $reg) {
            $out[$reg] = self::honours($byStudent[$reg] ?? []);
        }
        return $out;
    }

    /**
     * The Project module among the final-level rows, or null.
     *
     * Where several match — a two-part project, or a "Research Project" beside
     * a "Project Proposal" — the heaviest by credit is the one the regulations
     * mean, and ties break on the lower mark so the check stays conservative.
     *
     * @param  array<int,array<string,mixed>> $rows
     * @return array<string,mixed>|null
     */
    private static function findProject(array $rows): ?array
    {
        $best = null;
        foreach ($rows as $r) {
            $haystack = $r['name'] . ' ' . $r['code'];
            if (!preg_match(self::PROJECT_PATTERN, $haystack)) continue;
            if ($best === null
                || $r['credits'] > $best['credits']
                || ($r['credits'] === $best['credits'] && $r['pct'] < $best['pct'])) {
                $best = $r;
            }
        }
        return $best;
    }

    /**
     * Levels the classification is computed over — {@see FINAL_LEVELS}, unless
     * `DEGREE_CLASSIFICATION_LEVELS` overrides it ("3,4").
     *
     * @return array<int,int>
     */
    private static function finalLevels(): array
    {
        $env = trim((string)(getenv('DEGREE_CLASSIFICATION_LEVELS') ?: ''));
        if ($env === '') return self::FINAL_LEVELS;

        $levels = [];
        foreach (explode(',', $env) as $part) {
            $n = (int)trim($part);
            if ($n > 0) $levels[] = $n;
        }
        return $levels ?: self::FINAL_LEVELS;
    }

    /** A percentage that is actually a number, or null. */
    private static function pct(mixed $v): ?float
    {
        if ($v === null || $v === '' || !is_numeric($v)) return null;
        return (float)$v;
    }
}
