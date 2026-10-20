<?php

declare(strict_types=1);

namespace App\Helpers;

use Core\Database;

/**
 * The academic year and term that lecturer module assignments are written to and
 * read from. It is the year shown in the top bar. The term is the top-bar term if it
 * belongs to that year; otherwise the year's current term, or its first term.
 */
final class AcademicYearTerm
{
    /** @return array{0:?int,1:?int} [academic_year_id, academic_term_id] */
    public static function current(): array
    {
        $db = Database::getInstance();

        $yearId = AcademicContext::yearId();
        if ($yearId === null) {
            $row    = $db->fetchOne('SELECT id FROM academic_years WHERE is_current = 1 LIMIT 1');
            $yearId = $row ? (int) $row['id'] : null;
        }
        if ($yearId === null) {
            return [null, null];
        }

        $termId   = AcademicContext::termId();
        $termYear = null;
        if ($termId !== null) {
            $row      = $db->fetchOne('SELECT academic_year_id FROM academic_terms WHERE id = ?', [$termId]);
            $termYear = $row ? (int) $row['academic_year_id'] : null;
        }
        if ($termId === null || $termYear !== $yearId) {
            $row    = $db->fetchOne(
                'SELECT id FROM academic_terms WHERE academic_year_id = ? ORDER BY is_current DESC, start_date ASC LIMIT 1',
                [$yearId]
            );
            $termId = $row ? (int) $row['id'] : null;
        }

        return [$yearId, $termId];
    }
}
