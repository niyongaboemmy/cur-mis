-- ============================================================
-- Migration 072 — Align `revaluations` table with the application code.
--
-- The comprehensive schema (027) created `revaluations` with the columns
-- (module_id, status enum incl. 'completed') but RevaluationController /
-- RevaluationModel were later written against a different shape:
--   exam_id (module_marks.id), fee_paid, new_marks, reviewed_by, reviewed_at,
--   status enum('pending','approved','processed','rejected').
-- Production was hand-altered to match, but no migration reproduced it — so a
-- fresh deploy would break. This migration brings the table to the shape the
-- code expects. Every step is guarded so it is a safe no-op on databases that
-- already have the correct schema.
-- ============================================================

SET @db := DATABASE();

-- 1. exam_id — the contested module_marks.id (replaces legacy module_id).
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'revaluations' AND COLUMN_NAME = 'exam_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `revaluations` ADD COLUMN `exam_id` INT UNSIGNED NOT NULL AFTER `student_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 2. fee_paid — revaluation fee recorded on the request.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'revaluations' AND COLUMN_NAME = 'fee_paid');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `revaluations` ADD COLUMN `fee_paid` DECIMAL(10,2) NULL DEFAULT NULL AFTER `reason`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 3. new_marks — the revised mark captured when a request is processed.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'revaluations' AND COLUMN_NAME = 'new_marks');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `revaluations` ADD COLUMN `new_marks` DECIMAL(5,2) NULL DEFAULT NULL AFTER `status`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 4. reviewed_by — staff user id that actioned the request.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'revaluations' AND COLUMN_NAME = 'reviewed_by');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `revaluations` ADD COLUMN `reviewed_by` INT UNSIGNED NULL DEFAULT NULL AFTER `new_marks`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 5. reviewed_at — when the request was actioned.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'revaluations' AND COLUMN_NAME = 'reviewed_at');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `revaluations` ADD COLUMN `reviewed_at` DATETIME NULL DEFAULT NULL AFTER `reviewed_by`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 6. status — widen to a superset, migrate legacy 'completed' -> 'processed',
--    then settle on the final four values the code uses.
ALTER TABLE `revaluations`
  MODIFY COLUMN `status` ENUM('pending','approved','processed','rejected','completed')
  NOT NULL DEFAULT 'pending';
UPDATE `revaluations` SET `status` = 'processed' WHERE `status` = 'completed';
ALTER TABLE `revaluations`
  MODIFY COLUMN `status` ENUM('pending','approved','processed','rejected')
  NOT NULL DEFAULT 'pending';

-- 7. Drop the legacy module_id column (NOT NULL with no default — it would
--    block inserts from the controller, which never supplies it).
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'revaluations' AND COLUMN_NAME = 'module_id');
SET @stmt := IF(@col = 1,
  'ALTER TABLE `revaluations` DROP COLUMN `module_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
