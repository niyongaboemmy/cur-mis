<?php

declare(strict_types=1);

namespace App\Helpers;

use App\Models\GradingScaleModel;

/**
 * The one place a percentage becomes a letter grade.
 *
 * The bands are configured by the registry at /academic/grading-scale and live
 * in `grading_scales`. Before this helper existed three separate copies of a
 * hardcoded A/B/C/D/E ladder decided grades — in ModuleMarksController,
 * StudentController and the marks page — so the configured scale governed the
 * settings screen and nothing else. Everything that grades a mark now reads
 * from here, and re-configuring a band changes every screen at once.
 *
 * ── Why a ladder, not a range match ───────────────────────────────────────
 * `GradingScaleModel::gradeFor()` requires `min <= pct <= max`, and the bands
 * as configured leave gaps: A is 80–100 and B+ is 70–79, so 79.50 — a
 * perfectly ordinary DECIMAL(5,2) percentage — matches no band at all and
 * grades as nothing. Walking the bands from the highest minimum down and
 * taking the first whose minimum is met closes those gaps in the direction a
 * grading scale is actually read, and never depends on `max_marks` lining up
 * exactly with the next band's minimum.
 */
final class GradingScale
{
    /**
     * The mark at or above which a module counts as passed.
     *
     * Kept here rather than repeated as a bare `50` beside every decision, so
     * the roll-up in ModuleMarksController and the per-level decision printed
     * on the transcript can never drift apart.
     */
    public const PASS_MARK = 50.0;

    /** Bands ordered by min_marks DESC, resolved once per request. */
    private static ?array $bands = null;

    /**
     * Fallback ladder, used only when `grading_scales` is empty or unreadable.
     * This is the scheme that was hardcoded before, so an empty table degrades
     * to the previous behaviour rather than to no grades at all.
     */
    private const FALLBACK = [
        ['grade' => 'A', 'min_marks' => 80.0, 'max_marks' => 100.0, 'grade_point' => 4.0, 'description' => 'Very Good'],
        ['grade' => 'B', 'min_marks' => 70.0, 'max_marks' => 79.99, 'grade_point' => 3.0, 'description' => 'Good'],
        ['grade' => 'C', 'min_marks' => 60.0, 'max_marks' => 69.99, 'grade_point' => 2.0, 'description' => 'Satisfaction'],
        ['grade' => 'D', 'min_marks' => 50.0, 'max_marks' => 59.99, 'grade_point' => 1.0, 'description' => 'Pass'],
        ['grade' => 'E', 'min_marks' => 0.0,  'max_marks' => 49.99, 'grade_point' => 0.0, 'description' => 'Fail'],
    ];

    /** @return array<int,array<string,mixed>> highest band first */
    public static function bands(): array
    {
        if (self::$bands !== null) return self::$bands;

        try {
            $rows = (new GradingScaleModel())->allBands();
        } catch (\Throwable) {
            $rows = [];
        }
        if (!$rows) $rows = self::FALLBACK;

        // allBands() already sorts by min_marks DESC; re-sort defensively so a
        // caller passing its own rows in future cannot break the ladder.
        usort($rows, fn($a, $b) => (float)$b['min_marks'] <=> (float)$a['min_marks']);

        return self::$bands = $rows;
    }

    /** The band covering this percentage, or null when there is none. */
    public static function bandFor(?float $pct): ?array
    {
        if ($pct === null) return null;
        $bands = self::bands();
        foreach ($bands as $b) {
            if ($pct >= (float)$b['min_marks']) return $b;
        }
        // Below every configured minimum — the lowest band is still the answer
        // (a scale whose floor is above 0 should not leave a mark ungraded).
        return $bands ? $bands[count($bands) - 1] : null;
    }

    /** Letter grade for a percentage — 'A', 'B+', … — or null. */
    public static function gradeFor(?float $pct): ?string
    {
        $b = self::bandFor($pct);
        return $b !== null ? (string)$b['grade'] : null;
    }

    /** Grade point for a percentage, for GPA / CGPA. */
    public static function gradePointFor(?float $pct): ?float
    {
        $b = self::bandFor($pct);
        return $b !== null ? (float)$b['grade_point'] : null;
    }

    /** Human label for a percentage's band ('Distinction', 'Pass', …). */
    public static function labelFor(?float $pct): ?string
    {
        $b = self::bandFor($pct);
        $d = $b['description'] ?? null;
        return $d !== null && $d !== '' ? (string)$d : null;
    }

    /** Human label for an already-resolved letter grade. */
    public static function labelForGrade(?string $grade): ?string
    {
        if ($grade === null || $grade === '') return null;
        foreach (self::bands() as $b) {
            if ((string)$b['grade'] === $grade) {
                $d = $b['description'] ?? null;
                return $d !== null && $d !== '' ? (string)$d : null;
            }
        }
        return null;
    }

    /** Drop the cached bands — call after the scale is edited. */
    public static function flush(): void
    {
        self::$bands = null;
    }
}
