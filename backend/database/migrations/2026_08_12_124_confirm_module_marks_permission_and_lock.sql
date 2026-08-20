-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 124: CONFIRM_MODULE_MARKS permission + confirmation audit columns.
-- Date: 2026-08-12
--
-- Closes two holes in the marks-confirmation workflow.
--
-- `module_marks.status` already runs draft → claims_open → submitted → confirmed,
-- and the UI greys out every input once a module is submitted/confirmed. But:
--
--   1. The lock was cosmetic. ModuleMarksController::saveMarks never inspected
--      `status`, so a plain POST to /api/marks overwrote confirmed marks. The
--      controller change that lands with this migration rejects those writes.
--
--   2. `/api/marks/workflow` accepted BOTH `confirm` and `reset` under the same
--      RECORD_MODULE_MARKS gate — and `reset` clears confirmed_at back to draft.
--      Any lecturer could therefore confirm their own marks and immediately
--      unlock and edit them, which defeats the point of confirming.
--
-- This adds a distinct slug so confirming (and un-confirming) is a registry act,
-- separate from recording.
--
-- ── Access change, deliberate ────────────────────────────────────────────────
-- Today RECORD_MODULE_MARKS is held by: admin, HOD, lecturer, superadmin.
-- All four can currently confirm AND reset. After this migration only the roles
-- granted below can. `admin` and `HOD` lose the ability to confirm/unlock — they
-- keep full record/manage rights. Grant them the new slug from the Roles screen
-- if that turns out to be too tight in practice.
--
-- Idempotent: INSERT IGNORE against the UNIQUE key on `permissions.slug` and on
-- `role_permissions (role_id, permission_id)`; the ALTERs are guarded through
-- INFORMATION_SCHEMA because production is MariaDB (no ADD COLUMN IF NOT EXISTS
-- in the MySQL 8 used locally).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── §1  Catalogue the slug, alongside its VIEW/RECORD/MANAGE siblings ─────────
-- The three existing *_MODULE_MARKS slugs live in category 21, 'Modules
-- Management'; keep this one with them so the Permissions screen groups them.
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
SELECT
    (SELECT `id` FROM `permission_categories` WHERE `name` = 'Modules Management' LIMIT 1),
    'Confirm Module Marks',
    'CONFIRM_MODULE_MARKS',
    'Confirm a module mark sheet (locking it against further edits) and re-open a confirmed sheet for correction.';

-- category_id is NOT NULL, so fall back to any category if this database does
-- not carry 'Modules Management' under that exact name.
UPDATE `permissions`
SET `category_id` = (SELECT `id` FROM `permission_categories` ORDER BY `id` ASC LIMIT 1)
WHERE `slug` = 'CONFIRM_MODULE_MARKS' AND (`category_id` IS NULL OR `category_id` = 0);


-- ── §2  Grant to the registry only ───────────────────────────────────────────
-- superadmin bypasses every permission check in AuthService::isSuperadmin, but
-- this codebase still grants it explicitly (114 rows) so the Roles screen shows
-- the truth rather than an empty cell.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
CROSS JOIN `permissions` p
WHERE p.`slug` = 'CONFIRM_MODULE_MARKS'
  AND r.`name` IN ('superadmin', 'registrar');


-- ── §3  Audit columns: who submitted / who confirmed ─────────────────────────
-- `submitted_at` and `confirmed_at` already exist; only the actor was missing,
-- so a confirmed sheet could not be traced back to a person.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'module_marks'
               AND COLUMN_NAME  = 'submitted_by');
SET @stmt := IF(@col = 0,
    'ALTER TABLE `module_marks` ADD COLUMN `submitted_by` INT UNSIGNED NULL DEFAULT NULL AFTER `submitted_at`',
    'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'module_marks'
               AND COLUMN_NAME  = 'confirmed_by');
SET @stmt := IF(@col = 0,
    'ALTER TABLE `module_marks` ADD COLUMN `confirmed_by` INT UNSIGNED NULL DEFAULT NULL AFTER `confirmed_at`',
    'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- No FK to `users`: module_marks carries 266k+ rows on production and the
-- existing actor column (`recorded_by`) is likewise an unconstrained INT.
-- Kept consistent rather than introducing a lock-heavy constraint here.

-- ── §4  Index for the "recently added marks" filter ──────────────────────────
-- The roster gains a date-added filter, which sorts/filters on created_at
-- within a module + term.
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'module_marks'
               AND INDEX_NAME   = 'idx_module_marks_module_term_created');
SET @stmt := IF(@idx = 0,
    'CREATE INDEX `idx_module_marks_module_term_created` ON `module_marks` (`module_id`, `academic_term_id`, `created_at`)',
    'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
