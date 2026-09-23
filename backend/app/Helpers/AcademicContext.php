<?php

declare(strict_types=1);

namespace App\Helpers;

use Core\Database;
use Throwable;

/**
 * Request-scoped "which academic year / term is the caller looking at".
 *
 * By default the whole app filters against the year and term flagged
 * `is_current` in the DB. A staff user can switch context from the topnav
 * selector; the frontend then sends the chosen ids on every request as the
 * `X-Academic-Year-Id` / `X-Academic-Term-Id` headers. This helper resolves
 * those headers once (validating them against the DB) and otherwise falls
 * back to the real active year/term.
 *
 * NOTE: this is a *view* override only. Write paths that must always bind to
 * the true active year (admissions intake, payment reconciliation, seeders)
 * deliberately keep calling the models' `getActive()` directly.
 */
final class AcademicContext
{
    private static bool $resolved = false;
    private static ?array $year = null;
    private static ?array $term = null;

    /** Reset memoised state — for tests. */
    public static function flush(): void
    {
        self::$resolved = false;
        self::$year = null;
        self::$term = null;
    }

    private static function resolve(): void
    {
        if (self::$resolved) {
            return;
        }
        self::$resolved = true;

        $db = Database::getInstance();

        // ── Year ──────────────────────────────────────────────────────
        $headerYearId = self::headerInt('HTTP_X_ACADEMIC_YEAR_ID');
        $year = false;
        if ($headerYearId !== null) {
            try {
                $year = $db->fetchOne(
                    'SELECT * FROM `academic_years` WHERE id = ? LIMIT 1',
                    [$headerYearId]
                );
            } catch (Throwable) {
                $year = false;
            }
        }
        if (!$year) {
            $year = $db->fetchOne('SELECT * FROM `academic_years` WHERE is_current = 1 ORDER BY id DESC LIMIT 1');
        }
        self::$year = $year ?: null;

        // ── Term ──────────────────────────────────────────────────────
        $headerTermId = self::headerInt('HTTP_X_ACADEMIC_TERM_ID');
        $term = false;
        if ($headerTermId !== null) {
            try {
                $term = $db->fetchOne(
                    'SELECT * FROM `academic_terms` WHERE id = ? LIMIT 1',
                    [$headerTermId]
                );
            } catch (Throwable) {
                $term = false;
            }
            // A term from a different year than the one in context is ignored.
            if ($term && self::$year && (int)($term['academic_year_id'] ?? 0) !== (int)self::$year['id']) {
                $term = false;
            }
        }
        if (!$term) {
            if (self::$year) {
                $term = $db->fetchOne(
                    'SELECT * FROM `academic_terms` WHERE is_current = 1 AND academic_year_id = ? ORDER BY id DESC LIMIT 1',
                    [(int)self::$year['id']]
                );
            }
            if (!$term) {
                $term = $db->fetchOne('SELECT * FROM `academic_terms` WHERE is_current = 1 ORDER BY id DESC LIMIT 1');
            }
        }
        self::$term = $term ?: null;
    }

    private static function headerInt(string $serverKey): ?int
    {
        $raw = $_SERVER[$serverKey] ?? null;
        if ($raw === null || $raw === '' || !ctype_digit((string) $raw)) {
            return null;
        }
        $val = (int) $raw;
        return $val > 0 ? $val : null;
    }

    /** The academic-year row in context (override or active), or null. */
    public static function year(): ?array
    {
        self::resolve();
        return self::$year;
    }

    /** The academic-term row in context (override or active), or null. */
    public static function term(): ?array
    {
        self::resolve();
        return self::$term;
    }

    /** The academic-year id in context, or null when none is configured. */
    public static function yearId(): ?int
    {
        $y = self::year();
        return $y ? (int) $y['id'] : null;
    }

    /** The academic-term id in context, or null when none is configured. */
    public static function termId(): ?int
    {
        $t = self::term();
        return $t ? (int) $t['id'] : null;
    }

    /** True when the caller is viewing something other than the real active year. */
    public static function isOverridden(): bool
    {
        self::resolve();
        return self::$year !== null && (int) (self::$year['is_current'] ?? 0) !== 1;
    }
}
