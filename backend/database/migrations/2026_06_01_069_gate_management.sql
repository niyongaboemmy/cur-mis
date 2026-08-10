-- =============================================================================
-- Migration 069 — Gate Management Module
-- Date: 2026-06-01
-- Adds performance indexes on gate_logs, a gate_sessions table, and
-- seeds the three gate permissions into the permissions table.
-- =============================================================================

-- ── 1. Indexes on existing gate_logs ─────────────────────────────────────────
-- Guarded via INFORMATION_SCHEMA rather than `ADD COLUMN IF NOT EXISTS` /
-- `CREATE INDEX IF NOT EXISTS`, which are MariaDB-only and are 1064 syntax
-- errors on MySQL 8.

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gate_logs' AND COLUMN_NAME='notes');
SET @stmt := IF(@col=0,
  'ALTER TABLE `gate_logs` ADD COLUMN `notes` VARCHAR(500) DEFAULT NULL AFTER `reason`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gate_logs' AND COLUMN_NAME='photo_url');
SET @stmt := IF(@col=0,
  'ALTER TABLE `gate_logs` ADD COLUMN `photo_url` VARCHAR(255) DEFAULT NULL AFTER `notes`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gate_logs' AND INDEX_NAME='idx_gate_logs_student_id');
SET @stmt := IF(@idx=0, 'CREATE INDEX `idx_gate_logs_student_id` ON `gate_logs` (`student_id`)', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gate_logs' AND INDEX_NAME='idx_gate_logs_created_at');
SET @stmt := IF(@idx=0, 'CREATE INDEX `idx_gate_logs_created_at` ON `gate_logs` (`created_at`)', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gate_logs' AND INDEX_NAME='idx_gate_logs_result');
SET @stmt := IF(@idx=0, 'CREATE INDEX `idx_gate_logs_result` ON `gate_logs` (`result`)', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gate_logs' AND INDEX_NAME='idx_gate_logs_scan_type');
SET @stmt := IF(@idx=0, 'CREATE INDEX `idx_gate_logs_scan_type` ON `gate_logs` (`scan_type`)', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 2. Gate sessions (officer shift tracking) ────────────────────────────────
CREATE TABLE IF NOT EXISTS `gate_sessions` (
  `id`           INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `officer_id`   INT(10) UNSIGNED NOT NULL,
  `gate`         VARCHAR(40)      NOT NULL DEFAULT 'Main Gate',
  `opened_at`    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at`    DATETIME         DEFAULT NULL,
  `notes`        VARCHAR(500)     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_gate_sessions_officer` (`officer_id`),
  KEY `idx_gate_sessions_opened`  (`opened_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. Seed gate permissions ──────────────────────────────────────────────────
INSERT IGNORE INTO `permissions` (`slug`, `name`, `category_id`, `created_at`)
SELECT
    p.slug,
    p.name,
    (SELECT id FROM `permission_categories` WHERE name = 'Gate Management' LIMIT 1) AS category_id,
    NOW()
FROM (
    SELECT 'VIEW_GATE_LOGS' AS slug, 'View Gate Logs'  AS name
    UNION ALL
    SELECT 'MANAGE_GATE',           'Manage Gate'
    UNION ALL
    SELECT 'ACCESS_GATE',           'Access Gate Verification'
) p
WHERE (SELECT id FROM `permission_categories` WHERE name = 'Gate Management' LIMIT 1) IS NOT NULL;

-- Insert category if missing, then seed permissions
INSERT IGNORE INTO `permission_categories` (`name`, `created_at`)
SELECT 'Gate Management', NOW()
WHERE NOT EXISTS (SELECT 1 FROM `permission_categories` WHERE name = 'Gate Management');

INSERT IGNORE INTO `permissions` (`slug`, `name`, `category_id`, `created_at`)
SELECT slug, name,
       (SELECT id FROM `permission_categories` WHERE name = 'Gate Management' LIMIT 1),
       NOW()
FROM (
    SELECT 'VIEW_GATE_LOGS' AS slug, 'View Gate Logs' AS name
    UNION ALL
    SELECT 'MANAGE_GATE',   'Manage Gate'
    UNION ALL
    SELECT 'ACCESS_GATE',   'Access Gate Verification'
) p
WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE slug = p.slug);
