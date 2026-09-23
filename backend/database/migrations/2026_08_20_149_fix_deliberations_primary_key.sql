-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 149: give `deliberations` its primary key back.
-- Date: 2026-08-20
--
-- WHY
-- ───
-- `deliberations.id` was created with neither a PRIMARY KEY nor AUTO_INCREMENT:
--
--   SHOW COLUMNS FROM deliberations;
--   id  int(10) unsigned  key=   extra=      ← no key, no auto_increment
--
-- So every POST /api/deliberation/sessions failed with
--   SQLSTATE[HY000] 1364 Field 'id' doesn't have a default value
-- and no deliberation session could be created at all. The two rows that do
-- exist were inserted with explicit ids by an older seed.
--
-- This was found while wiring up the board's per-student decisions (migration
-- 148), which are keyed on `deliberation_id` — there is no point recording a
-- decision against a session that cannot be created.
--
-- SAFETY
-- ──────
-- Checked before writing this: the existing rows have unique, non-null ids
-- (2 rows, 2 distinct ids, 0 nulls), so the key can be added without
-- rewriting any data. AUTO_INCREMENT resumes above the highest existing id.
--
-- Idempotent: the column is only altered when the key is actually absent.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Primary key ───────────────────────────────────────────────────────────
SET @has_pk := (
    SELECT COUNT(*)
      FROM `information_schema`.`STATISTICS`
     WHERE `TABLE_SCHEMA` = DATABASE()
       AND `TABLE_NAME`   = 'deliberations'
       AND `INDEX_NAME`   = 'PRIMARY'
);

SET @sql := IF(
    @has_pk = 0,
    'ALTER TABLE `deliberations` ADD PRIMARY KEY (`id`)',
    'SELECT "deliberations already has a primary key" AS note'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. AUTO_INCREMENT ────────────────────────────────────────────────────────
-- Separate statement: a table can carry the key without the auto-increment,
-- which is exactly the state a partially-repaired database would be in.
SET @has_ai := (
    SELECT COUNT(*)
      FROM `information_schema`.`COLUMNS`
     WHERE `TABLE_SCHEMA` = DATABASE()
       AND `TABLE_NAME`   = 'deliberations'
       AND `COLUMN_NAME`  = 'id'
       AND `EXTRA` LIKE '%auto_increment%'
);

SET @sql := IF(
    @has_ai = 0,
    'ALTER TABLE `deliberations` MODIFY `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT',
    'SELECT "deliberations.id is already auto_increment" AS note'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
