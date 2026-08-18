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
 *
 * ── Why letters are stripped of + and − ───────────────────────────────────
 * CUR grades in whole letters: A, B, C, D, E. The registry's `grading_scales`
 * rows are still split finer in places (a "B+" band at 75–79.99 beside a "B"
 * at 70–74.99, inherited from the seeded 4.0-style scale), and those suffixes
 * were reaching the transcript — the printed form and the screen both showed
 * "B+", a grade the institution does not award. {@see normalize()} drops the
 * suffix wherever a letter is *displayed*, while `grade_point` still comes
 * from the band the mark actually fell in, so a finer-grained scale keeps its
 * GPA resolution without inventing a letter.
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

    /**
     * Strip the +/- modifier off a letter grade: 'B+' → 'B', 'C-' → 'C'.
     *
     * Unicode minus and en-dash are handled alongside ASCII '-' because the
     * scale is edited through a web form and both get pasted in.
     */
    public static function normalize(?string $grade): ?string
    {
        if ($grade === null) return null;
        $g = trim($grade);
        if ($g === '') return null;
        $g = (string)preg_replace('/[+\-\x{2212}\x{2013}]+$/u', '', $g);
        return trim($g);
    }

    /**
     * The bands as the transcript prints them: one entry per whole letter,
     * with the sub-bands of that letter folded into a single range.
     *
     * A scale of A / B+ / B / C+ / C / D / E collapses to A / B / C / D / E,
     * where B spans the lowest B min to the highest B+ max. The description
     * kept is the one belonging to the unsuffixed band ("Good" rather than
     * "Good Plus"); when only suffixed bands exist, the highest one's is used.
     *
     * @return array<int,array<string,mixed>> highest band first
     */
    public static function displayBands(): array
    {
        $merged = [];
        foreach (self::bands() as $b) {          // already highest-first
            $letter = self::normalize((string)($b['grade'] ?? '')) ?? '';
            if ($letter === '') continue;

            $raw  = trim((string)($b['grade'] ?? ''));
            $desc = (string)($b['description'] ?? '');

            if (!isset($merged[$letter])) {
                $merged[$letter] = [
                    'grade'       => $letter,
                    'min_marks'   => (float)$b['min_marks'],
                    'max_marks'   => (float)$b['max_marks'],
                    'grade_point' => (float)$b['grade_point'],
                    'description' => $desc,
                    // Whether the description came from the plain letter's own
                    // band, which outranks any suffixed sibling's.
                    '_exact'      => $raw === $letter,
                ];
                continue;
            }

            $m = &$merged[$letter];
            $m['min_marks'] = min($m['min_marks'], (float)$b['min_marks']);
            $m['max_marks'] = max($m['max_marks'], (float)$b['max_marks']);
            if (!$m['_exact'] && $raw === $letter) {
                $m['description'] = $desc;
                $m['grade_point'] = (float)$b['grade_point'];
                $m['_exact']      = true;
            }
            unset($m);
        }

        $out = array_values($merged);
        foreach ($out as &$b) unset($b['_exact']);
        unset($b);

        usort($out, fn($a, $c) => (float)$c['min_marks'] <=> (float)$a['min_marks']);
        return $out;
    }

    /** Letter grade for a percentage — 'A', 'B', … — or null. Never suffixed. */
    public static function gradeFor(?float $pct): ?string
    {
        $b = self::bandFor($pct);
        return $b !== null ? self::normalize((string)$b['grade']) : null;
    }

    /** Grade point for a percentage, for GPA / CGPA. */
    public static function gradePointFor(?float $pct): ?float
    {
        $b = self::bandFor($pct);
        return $b !== null ? (float)$b['grade_point'] : null;
    }

    /**
     * Human label for a percentage's band ('Distinction', 'Pass', …).
     *
     * Read off the merged letter rather than the raw band, so the word beside
     * a mark is the same word the printed grading key gives for its letter —
     * a 77% cannot be described as "Good Plus" while the key calls B "Good".
     */
    public static function labelFor(?float $pct): ?string
    {
        return self::labelForGrade(self::gradeFor($pct));
    }

    /** Human label for an already-resolved letter grade, suffixed or not. */
    public static function labelForGrade(?string $grade): ?string
    {
        $letter = self::normalize($grade);
        if ($letter === null) return null;
        foreach (self::displayBands() as $b) {
            if ((string)$b['grade'] === $letter) {
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
