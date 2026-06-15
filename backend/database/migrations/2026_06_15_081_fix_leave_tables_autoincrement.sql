-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 081: Repair leave_requests / leave_types primary keys.
-- Date: 2026-06-15
--   On some environments these tables were created WITHOUT a PRIMARY KEY /
--   AUTO_INCREMENT on `id`, so inserts fail with:
--     SQLSTATE[HY000] 1364 Field 'id' doesn't have a default value.
--   `leave_types` had also been seeded twice with two conflicting catalogues
--   sharing the same ids. Since leave_requests and leave_balances are empty,
--   we rebuild a single clean catalogue. This migration is idempotent.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── leave_requests: ensure PRIMARY KEY + AUTO_INCREMENT on id ────────────────
SET @has_pk = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND INDEX_NAME = 'PRIMARY');
SET @sql = IF(@has_pk = 0,
  'ALTER TABLE `leave_requests` ADD PRIMARY KEY (`id`)',
  'SELECT ''leave_requests already has a primary key''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @is_ai = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'id' AND EXTRA LIKE '%auto_increment%');
SET @sql = IF(@is_ai = 0,
  'ALTER TABLE `leave_requests` MODIFY `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT',
  'SELECT ''leave_requests.id already auto_increment''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Legacy columns that the app never populates must be nullable, otherwise
-- inserts fail with 1364 "Field ... doesn't have a default value".
SET @nn = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'staff_id' AND IS_NULLABLE = 'NO');
SET @sql = IF(@nn = 1,
  'ALTER TABLE `leave_requests` MODIFY `staff_id` INT(10) UNSIGNED NULL DEFAULT NULL',
  'SELECT ''staff_id already nullable or absent''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_lt = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'leave_type' AND IS_NULLABLE = 'NO');
SET @sql = IF(@has_lt = 1,
  'ALTER TABLE `leave_requests` MODIFY `leave_type` ENUM(''Annual'',''Sick'',''Mission'',''Short Absence'',''Training'') NULL DEFAULT NULL',
  'SELECT ''leave_type already nullable or absent''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── leave_types: wipe the corrupted/duplicated catalogue, fix the key ────────
-- (leave_requests + leave_balances are empty, so no references break.)
TRUNCATE TABLE `leave_types`;

SET @has_pk = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_types' AND INDEX_NAME = 'PRIMARY');
SET @sql = IF(@has_pk = 0,
  'ALTER TABLE `leave_types` ADD PRIMARY KEY (`id`)',
  'SELECT ''leave_types already has a primary key''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @is_ai = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_types' AND COLUMN_NAME = 'id' AND EXTRA LIKE '%auto_increment%');
SET @sql = IF(@is_ai = 0,
  'ALTER TABLE `leave_types` MODIFY `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT',
  'SELECT ''leave_types.id already auto_increment''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Re-seed one clean catalogue (ids assigned by AUTO_INCREMENT) ─────────────
INSERT INTO `leave_types` (`name`, `description`, `days_allowed`, `is_paid`, `color`, `is_active`) VALUES
  ('Annual Leave',    'Paid annual vacation leave.',            21, 1, '#22C55E', 1),
  ('Sick Leave',      'Paid leave for illness or injury.',      15, 1, '#F97316', 1),
  ('Maternity Leave', 'Paid maternity leave.',                  84, 1, '#EC4899', 1),
  ('Paternity Leave', 'Paid paternity leave.',                   4, 1, '#6366F1', 1),
  ('Compassionate',   'Paid compassionate / bereavement leave.', 5, 1, '#A855F7', 1),
  ('Study Leave',     'Paid leave for study or examinations.',   10, 1, '#0EA5E9', 1),
  ('Unpaid Leave',    'Leave without pay.',                      30, 0, '#6B7280', 1);
