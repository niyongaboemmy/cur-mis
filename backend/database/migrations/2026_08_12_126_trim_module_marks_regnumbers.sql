-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 126: normalise whitespace in `module_marks.student_regnumber`.
-- Date: 2026-08-12
--
-- 220 rows (77 distinct values) carry a leading tab, newline or space — e.g.
-- "\t1CUR24AK08600". MySQL's PAD SPACE collation trims trailing spaces when
-- comparing but NOT leading whitespace or tabs, so those rows:
--
--   • fail the roster's LEFT JOIN against `student.regnumber`, and
--   • count as a separate student in COUNT(DISTINCT), which is how a mark for
--     one student on module 1013 stayed invisible even after consolidation.
--
-- Trimming makes SQL agree with the application, which already trims the
-- regnumber when it de-duplicates the roster.
--
-- Nothing is deleted. 118 of these rows become identical to a clean row for the
-- same (module, term) — those are the same student recorded twice, and the
-- roster resolves them by taking the newest mark row per student, so the extra
-- row is harmless history rather than a duplicate on screen.
--
-- Idempotent: re-running trims values that are already trimmed, i.e. a no-op.
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE `module_marks`
SET `student_regnumber` = TRIM(BOTH '\t' FROM
                          TRIM(BOTH '\r' FROM
                          TRIM(BOTH '\n' FROM
                          TRIM(`student_regnumber`))))
WHERE `student_regnumber` <> TRIM(BOTH '\t' FROM
                            TRIM(BOTH '\r' FROM
                            TRIM(BOTH '\n' FROM
                            TRIM(`student_regnumber`))));
