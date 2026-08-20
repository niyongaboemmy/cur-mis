<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Degree classification engine.
 *
 * Maps a student's cumulative weighted average to the CUR
 * degree classification bands and determines graduation eligibility.
 *
 * Classification thresholds (configurable via constants):
 *   ≥ 80  → First Class
 *   ≥ 70  → Upper Second
 *   ≥ 60  → Lower Second
 *   ≥ 50  → Pass
 *   < 50  → Fail (not eligible)
 */
class DegreeClassificationService
{
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
}
