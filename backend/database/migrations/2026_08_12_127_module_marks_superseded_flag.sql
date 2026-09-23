-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 127: mark superseded rows in `module_marks` so reads stay fast.
-- Date: 2026-08-12
--
-- ── The problem ──────────────────────────────────────────────────────────────
-- `module_marks` holds ~119k rows that are superseded copies: 71,648 distinct
-- (module, student, term) combinations have more than one row, up to 33 deep.
--
-- Root cause: ModuleMarksController::saveMarks issues
--     INSERT ... ON DUPLICATE KEY UPDATE
-- but there has never been a UNIQUE key on
--     (module_id, student_regnumber, academic_term_id)
-- so the ON DUPLICATE branch can never fire — the only unique key is the
-- auto-increment PK. Every save therefore appends a brand-new row instead of
-- updating the existing one. The "upsert" has never been an upsert.
--
-- ── Why a flag and not a UNIQUE key ──────────────────────────────────────────
-- Adding the UNIQUE key that the upsert always assumed would require deleting
-- ~119k rows first. Those rows are history (earlier marks for the same student),
-- and the standing instruction on this data is that nothing gets discarded. So
-- this migration flags them instead: no row is removed, and every read filters
-- on a cheap indexed boolean rather than a correlated MAX(id) subquery.
--
-- That subquery is why the deliberation screen took 6-47 SECONDS per request.
-- It ran once per candidate row across 292k rows.
--
-- ── What "superseded" means ──────────────────────────────────────────────────
--   superseded = 0  → the current mark for that (module, student, term)
--   superseded = 1  → an earlier row kept for history, hidden from every screen
-- The newest row (highest id) always wins, matching how the mark sheet, the
-- transcript and the deliberation board already resolved the collision.
--
-- saveMarks re-computes the flag for the module+term it just wrote, so the
-- invariant holds for new saves without needing the UNIQUE key.
--
-- Re-runnable: the column add is guarded, and the flag is recomputed from
-- scratch each time rather than toggled.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── §1  The flag ─────────────────────────────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'module_marks'
               AND COLUMN_NAME  = 'superseded');
SET @stmt := IF(@col = 0,
    'ALTER TABLE `module_marks` ADD COLUMN `superseded` TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ── §2  Compute it ───────────────────────────────────────────────────────────
-- Via a helper table: MySQL cannot UPDATE a table that a subquery in the same
-- statement reads, and a materialised list of "winning" ids also keeps this to
-- one grouped scan instead of a per-row correlated lookup.
DROP TABLE IF EXISTS `_mm_latest`;

CREATE TABLE `_mm_latest` (
  `id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

INSERT INTO `_mm_latest` (`id`)
SELECT MAX(`id`)
FROM `module_marks`
GROUP BY `student_regnumber`, `module_id`, `academic_term_id`;

UPDATE `module_marks` mm
LEFT JOIN `_mm_latest` l ON l.`id` = mm.`id`
SET mm.`superseded` = IF(l.`id` IS NULL, 1, 0);

DROP TABLE `_mm_latest`;


-- ── §3  Indexes for the three read patterns ──────────────────────────────────
-- Mark sheet: one module + term, current rows only.
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'module_marks'
               AND INDEX_NAME = 'idx_mm_module_term_live');
SET @stmt := IF(@idx = 0,
    'CREATE INDEX `idx_mm_module_term_live` ON `module_marks` (`module_id`, `academic_term_id`, `superseded`)',
    'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Transcript / student record: one student, current rows only.
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'module_marks'
               AND INDEX_NAME = 'idx_mm_student_live');
SET @stmt := IF(@idx = 0,
    'CREATE INDEX `idx_mm_student_live` ON `module_marks` (`student_regnumber`, `superseded`)',
    'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Deliberation: whole-table aggregates over current rows.
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'module_marks'
               AND INDEX_NAME = 'idx_mm_live_module');
SET @stmt := IF(@idx = 0,
    'CREATE INDEX `idx_mm_live_module` ON `module_marks` (`superseded`, `module_id`)',
    'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
