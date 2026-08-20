-- ══════════════════════════════════════════════════════════════════════════════
-- ONE-OFF: bring an environment up to the graduation-audit feature.
--
-- Migrations 128, 129 and 130 concatenated, plus their ledger rows. Run this in
-- phpMyAdmin (or `mysql < thisfile`) against the live database.
--
-- WHY NOT THE MIGRATE WORKFLOW: `.github/workflows/migrate-backend.yml` applies
-- every pending migration, and live's ledger is missing 41 of them whose schema
-- is already present (they were applied out-of-band via the PROD_cumulated
-- roll-ups). Running it would execute
--     2026_07_15_096_reset_superadmin_passwords.sql
--     2026_07_16_PROD_cumulated_migration.sql
--     2026_08_10_PROD_cumulated_migration.sql
-- among others. This file applies only the three the feature needs.
--
-- Safe to run more than once: every statement is guarded through
-- INFORMATION_SCHEMA, and the ledger rows use REPLACE INTO.
--
-- AFTERWARDS: open Academic Records → Graduand list and press "Recompute" to
-- populate the snapshot (~3s for 13.7k students). Until then the lists are
-- correctly empty and say so.
-- ══════════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2026_08_12_128_create_graduation_audit_snapshot.sql
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 128: `graduation_audit` — persisted curriculum-completion snapshot.
-- Date: 2026-08-12
--
-- The completion audit answers "who has a mark for every module their program
-- requires". Computing it live means joining 13.7k students against their
-- curriculum and then against 292k mark rows: ~1s for a single graduation
-- cohort but ~7s for the whole table, which is too slow for a screen the
-- registry filters and re-sorts repeatedly, and slow enough that a broad
-- cut-off date flirts with the request timeout.
--
-- So the result is computed once and kept here, one row per student.
-- `GraduationAuditService::rebuildSnapshot()` fills it; every read is then a
-- single-table indexed query. `computed_at` is surfaced in the UI so nobody
-- mistakes a stale snapshot for live data, and marks entry does not silently
-- invalidate it — a rebuild is an explicit action.
--
-- Denormalised on purpose: regnumber, option, level and enrolment state are
-- copied in so the list, its filters and its sorts never need to touch
-- `student` at all. Hydration for the visible page still joins for names.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS is valid on both MySQL 8 (local MAMP)
-- and MariaDB (production cPanel). No ADD COLUMN IF NOT EXISTS anywhere — that
-- form is MariaDB-only and errors 1064 locally.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `graduation_audit` (
  `student_id`       INT(11)      NOT NULL,
  `regnumber`        VARCHAR(250) DEFAULT NULL,
  `option_id`        INT(11)      DEFAULT NULL,

  -- Derived start date. Not a copy of any single column: the regnumber's
  -- intake year leads and `registration_date` only refines it when the two
  -- agree. See GraduationAuditService::startedOnSql().
  `started_on`       DATE         DEFAULT NULL,
  `start_source`     VARCHAR(20)  DEFAULT NULL,
  `intake_year`      SMALLINT(6)  DEFAULT NULL,

  `student_state`    VARCHAR(40)  DEFAULT NULL,
  `current_level`    SMALLINT(6)  DEFAULT NULL,
  `programme_level`  VARCHAR(20)  DEFAULT NULL,

  -- Module buckets. Each curriculum module lands in exactly one of
  -- passed/failed/exempted/pending/missing, so those five sum to `expected`.
  `expected`         INT(11)      NOT NULL DEFAULT 0,
  `recorded`         INT(11)      NOT NULL DEFAULT 0,
  `passed`           INT(11)      NOT NULL DEFAULT 0,
  `failed`           INT(11)      NOT NULL DEFAULT 0,
  `exempted`         INT(11)      NOT NULL DEFAULT 0,
  `pending`          INT(11)      NOT NULL DEFAULT 0,
  `missing`          INT(11)      NOT NULL DEFAULT 0,
  `outstanding`      INT(11)      NOT NULL DEFAULT 0,
  -- No `extra` (marks outside the curriculum) column: finding those needs its
  -- own pass over every mark row, and it is only ever shown in the per-student
  -- drill-down, which computes it live.

  `percent_complete` DECIMAL(5,2) DEFAULT NULL,
  `is_complete`      TINYINT(1)   NOT NULL DEFAULT 0,

  `credits_expected` INT(11)      NOT NULL DEFAULT 0,
  `credits_earned`   INT(11)      NOT NULL DEFAULT 0,
  -- Credit-weighted average of the best attempt per module, 0–100.
  `weighted_avg`     DECIMAL(6,2) DEFAULT NULL,

  `computed_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`student_id`),
  -- The graduation roster: complete students, oldest cohort first.
  KEY `idx_ga_complete_started` (`is_complete`, `started_on`),
  -- The audit list is always bounded by a start date, usually with a state.
  KEY `idx_ga_state_started`    (`student_state`, `started_on`),
  KEY `idx_ga_option`           (`option_id`),
  KEY `idx_ga_outstanding`      (`outstanding`),
  KEY `idx_ga_regnumber`        (`regnumber`(40))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2026_08_12_129_repair_graduands_table.sql
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 129: make `graduands` writable.
-- Date: 2026-08-12
--
-- The table shipped as:
--     `id` int unsigned NOT NULL      -- no PRIMARY KEY, no AUTO_INCREMENT
--
-- so `INSERT INTO graduands (student_id, …)` has always died with
-- 1364 "Field 'id' doesn't have a default value". Nothing could ever be added
-- to the graduation list, which is why the screen has only ever shown
-- "No graduands found."
--
-- Three repairs:
--   1. `id` becomes a real auto-increment primary key.
--   2. `cgpa` DECIMAL(4,2) → DECIMAL(5,2). The old type tops out at 99.99, so a
--      student averaging 100% would have been rejected on insert.
--   3. An index on `student_id`, which the graduation roster joins on for every
--      row it renders.
--
-- Idempotent and portable: every step is guarded through INFORMATION_SCHEMA
-- rather than using MariaDB-only `IF NOT EXISTS` clauses, which are a 1064
-- syntax error on the local MySQL 8.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Give every existing row a unique id before a PRIMARY KEY can be added.
--    Rows can only exist here from a direct import (the app could never insert),
--    and they would all carry id = 0, which a PK would reject.
SET @pk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
              AND CONSTRAINT_TYPE = 'PRIMARY KEY');

SET @n := 0;
SET @sql := IF(@pk = 0,
  'UPDATE `graduands` SET `id` = (@n := @n + 1) ORDER BY `created_at`, `student_id`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(@pk = 0,
  'ALTER TABLE `graduands` ADD PRIMARY KEY (`id`)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 2. AUTO_INCREMENT (needs the key from step 1 to already exist).
SET @ai := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
              AND COLUMN_NAME = 'id' AND EXTRA LIKE '%auto_increment%');

SET @sql := IF(@ai = 0,
  'ALTER TABLE `graduands` MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 3. Widen cgpa so a 100% average fits.
SET @w := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
             AND COLUMN_NAME = 'cgpa' AND NUMERIC_PRECISION = 4);

SET @sql := IF(@w = 1,
  'ALTER TABLE `graduands` MODIFY `cgpa` DECIMAL(5,2) DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 4. Index the column the roster joins on.
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
               AND INDEX_NAME = 'idx_graduands_student');

SET @sql := IF(@idx = 0,
  'ALTER TABLE `graduands` ADD KEY `idx_graduands_student` (`student_id`)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2026_08_12_130_graduand_status_waiting.sql
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 130: graduand status vocabulary + one row per student.
-- Date: 2026-08-12
--
-- 1. `status` becomes ENUM('waiting','pending','approved','graduated') with
--    'waiting' as the default, replacing 'deferred'. A student who has finished
--    their curriculum but whom nobody has actioned yet is *waiting*, which is
--    also how the roster renders a student with no row here at all — the two
--    read identically on screen, so bulk-setting a status never has to care
--    which of the two it started from.
--
-- 2. UNIQUE KEY on `student_id`. Two things need it:
--      • the graduation roster LEFT JOINs `graduands` per student, so a second
--        row for the same student would silently duplicate them in the list;
--      • the bulk status update upserts with ON DUPLICATE KEY UPDATE, which
--        needs a unique index to match against.
--    Duplicates are collapsed first, keeping the furthest-progressed row.
--
-- Idempotent and portable — INFORMATION_SCHEMA guards rather than MariaDB-only
-- `IF NOT EXISTS`, which is a 1064 syntax error on the local MySQL 8.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Widen the enum so both old and new values are legal at once.
SET @t := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
             AND COLUMN_NAME = 'status');

SET @sql := IF(@t LIKE '%waiting%', 'SELECT 1',
  "ALTER TABLE `graduands` MODIFY `status`
     ENUM('waiting','pending','approved','graduated','deferred')
     NOT NULL DEFAULT 'waiting'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 2. Retire 'deferred'. A deferred graduand is one waiting to be actioned.
UPDATE `graduands` SET `status` = 'waiting' WHERE `status` = 'deferred';

-- ── 3. Narrow the enum to the four statuses the workflow now uses.
SET @t := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
             AND COLUMN_NAME = 'status');

SET @sql := IF(@t LIKE '%deferred%',
  "ALTER TABLE `graduands` MODIFY `status`
     ENUM('waiting','pending','approved','graduated')
     NOT NULL DEFAULT 'waiting'",
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 4. Collapse any duplicate rows per student before the unique key lands.
--    Ranking keeps the furthest-progressed record; `id` breaks ties so the
--    result is deterministic.
DELETE g FROM `graduands` g
JOIN `graduands` keep
  ON keep.student_id = g.student_id
 AND (
      FIELD(keep.status, 'waiting', 'pending', 'approved', 'graduated')
        > FIELD(g.status, 'waiting', 'pending', 'approved', 'graduated')
   OR (FIELD(keep.status, 'waiting', 'pending', 'approved', 'graduated')
        = FIELD(g.status, 'waiting', 'pending', 'approved', 'graduated')
       AND keep.id > g.id)
 );

-- ── 5. One graduand record per student.
SET @u := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
             AND INDEX_NAME = 'uniq_graduands_student');

SET @sql := IF(@u = 0,
  'ALTER TABLE `graduands` ADD UNIQUE KEY `uniq_graduands_student` (`student_id`)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 6. The plain index from migration 129 is now redundant — the unique key
--    above serves the same lookups as its leftmost prefix.
SET @i := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
             AND INDEX_NAME = 'idx_graduands_student');

SET @sql := IF(@i > 0,
  'ALTER TABLE `graduands` DROP INDEX `idx_graduands_student`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ══════════════════════════════════════════════════════════════════════════════
-- Ledger: record all three as applied so a later migrate/baseline skips them.
-- ══════════════════════════════════════════════════════════════════════════════
REPLACE INTO `schema_migrations` (`filename`, `status`, `applied_at`) VALUES
  ('2026_08_12_128_create_graduation_audit_snapshot.sql', 'applied', NOW()),
  ('2026_08_12_129_repair_graduands_table.sql',           'applied', NOW()),
  ('2026_08_12_130_graduand_status_waiting.sql',          'applied', NOW());
