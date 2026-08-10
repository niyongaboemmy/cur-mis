-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 117: Reconcile two columns the code requires but no *safe* migration
--                creates on an already-populated database.
-- Date: 2026-08-09
--
-- Both statements are INFORMATION_SCHEMA-guarded, so this is a no-op anywhere the
-- columns already exist (e.g. production, where 051 and 087 both ran). Purely
-- additive — no DROP, no TRUNCATE, no data rewrite.
--
-- ── §1  fee_payments.bank_slip_file_id ────────────────────────────────────────
-- `App\Models\FeePaymentModel::$fillable` lists `bank_slip_file_id`, and
-- FeeService::record() / FeeController both write it (as NULL for cash and other
-- manual payments). The only migration that creates the column is
-- 2026_05_16_051_fix_fee_payments_schema.sql, which does it by DROPping and
-- recreating `fee_payments` wholesale. On any database that has moved past 051 —
-- i.e. one where 052 (reversed status), 054 (student_id type), 061 (fee_type) and
-- 086 (source / source_application_id) have since landed — running 051 would
-- destroy those later columns along with the payment rows, so 051 must stay
-- skipped there. That leaves `bank_slip_file_id` as the one fillable column with
-- no additive path. This adds it directly.
--
-- Definition matches 051's: VARCHAR(36) NULL (a file-server UUID), nullable
-- because manual/cash payments legitimately have no bank slip — the same
-- nullability 087 §7 was trying to restore.
--
-- ── §2  options.title ─────────────────────────────────────────────────────────
-- GraduandController selects `o.title AS option_title`. The column is added by
-- 2026_07_02_087_fix_rbac_and_misc_prod_errors.sql §8, but 087 as a whole cannot
-- be applied to a database where the later name-resolved RBAC catalogue
-- migrations (094 / 103 / 104) have already run: 087 §2 pins
-- `permission_categories` to hard-coded ids, and §3 would then re-point every
-- `permissions.category_id` at those ids — silently moving permissions into the
-- wrong categories on any database whose category ids differ. This carries §8's
-- column across on its own, with the same backfill.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── §1  fee_payments.bank_slip_file_id ────────────────────────────────────────

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_payments'
               AND COLUMN_NAME = 'bank_slip_file_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `fee_payments` ADD COLUMN `bank_slip_file_id` VARCHAR(36) NULL DEFAULT NULL COMMENT ''UUID in file-server'' AFTER `reference_number`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Restore nullability if an older schema left the column NOT NULL (087 §7).
SET @notnull := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_payments'
                   AND COLUMN_NAME = 'bank_slip_file_id' AND IS_NULLABLE = 'NO');
SET @stmt := IF(@notnull > 0,
  'ALTER TABLE `fee_payments` MODIFY COLUMN `bank_slip_file_id` VARCHAR(36) NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ── §2  options.title ─────────────────────────────────────────────────────────

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'options'
               AND COLUMN_NAME = 'title');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `options` ADD COLUMN `title` VARCHAR(255) NULL DEFAULT NULL AFTER `name`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Backfill title from name where still NULL (same as 087 §8).
UPDATE `options` SET `title` = `name` WHERE `title` IS NULL;


-- ── §3  modules.description ───────────────────────────────────────────────────
-- `App\Models\ModuleModel::$fillable` lists `description`, and
-- ModulesManagementController::createCatalog() / updateCatalog() pass
-- `$request->body()` straight into create()/update(). BaseModel::filterFillable()
-- keeps any payload key that appears in $fillable, so a client that posts a
-- `description` field produces `INSERT INTO modules (…, description, …)` and a
-- 1054 "Unknown column" 500.
--
-- The column is only ever added by `backend/migrations/2024_04_23_012_extend_
-- modules_catalog.sql` — a file in the second, legacy migrations directory that
-- the runner never reads (MigrationService globs backend/database/migrations
-- only). Every other object from that directory already exists in the schema;
-- this column is the one that did not survive into the canonical set.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules'
               AND COLUMN_NAME = 'description');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `modules` ADD COLUMN `description` TEXT NULL DEFAULT NULL AFTER `module_name`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
