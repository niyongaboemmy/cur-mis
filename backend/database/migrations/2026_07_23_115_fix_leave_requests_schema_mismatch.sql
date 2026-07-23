-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 115: Reconcile leave_requests / leave_types with LeaveController.
-- Date: 2026-07-23
--   The original create-table migration (backend/migrations/020_create_leave_management.sql)
--   was placed outside backend/database/migrations/ and MigrationService never ran it,
--   so the live tables kept a legacy shape that migrations 080/081 only patched. As a
--   result the app (which always writes 'Pending'/'Approved'/'Rejected'/'Cancelled')
--   was failing every create/approve/reject/cancel with SQLSTATE 22001 "Data truncated
--   for column 'status'", because the live enum only accepted lowercase values.
--   leave_requests is empty in production, so this is a safe in-place ALTER.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── leave_requests.status: switch to the capitalized enum the app writes ────
ALTER TABLE `leave_requests`
  MODIFY `status` ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending';

-- ── leave_requests.days_requested: tinyint can't hold half-days (e.g. 4.5) ──
ALTER TABLE `leave_requests`
  MODIFY `days_requested` DECIMAL(5,1) NOT NULL DEFAULT 0;

-- ── leave_types.created_at: restore the column the intended schema had ──────
SET @has_created_at = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_types' AND COLUMN_NAME = 'created_at'
);
SET @sql = IF(@has_created_at = 0,
  'ALTER TABLE `leave_types` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `is_active`',
  'SELECT ''leave_types.created_at already exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
