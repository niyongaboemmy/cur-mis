-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: HR Module Redesign - Leave Management with Approval Chain
-- Date: 2026-09-04
--
-- Creates comprehensive leave management tables to support:
-- - Multiple leave types (Annual, Mission, Training, Short Absence)
-- - Leave balance tracking
-- - Supervisor-based approval hierarchy
-- - Leave request audit trail
--
-- Note: Uses existing leave_requests, leave_types, leave_approval_stages tables
-- from migration 2026_08_17_132. This migration enhances them.
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Ensure leave balance tracking table exists ───────────────────────────
CREATE TABLE IF NOT EXISTS `leave_balances` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`               INT UNSIGNED NOT NULL,
  `leave_type_id`         INT UNSIGNED NOT NULL,
  `fiscal_year`           INT NOT NULL COMMENT "e.g., 2026",
  `total_allocated`       DECIMAL(5,1) NOT NULL DEFAULT 0,
  `used`                  DECIMAL(5,1) NOT NULL DEFAULT 0,
  `carried_forward`       DECIMAL(5,1) NOT NULL DEFAULT 0,
  `available`             DECIMAL(5,1) NOT NULL DEFAULT 0,
  `last_updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lb_user_type_year` (`user_id`, `leave_type_id`, `fiscal_year`),
  CONSTRAINT `fk_lb_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lb_leave_type` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON DELETE RESTRICT,
  KEY `idx_lb_user` (`user_id`),
  KEY `idx_lb_year` (`fiscal_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Annual leave balance tracking per employee';

-- ── 2. Enhance leave_requests table with additional fields ────────────────────
SET @has_reason = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'reason'
);
SET @sql = IF(@has_reason = 0,
  'ALTER TABLE `leave_requests` ADD COLUMN `reason` TEXT NULL AFTER `leave_type_id`',
  'SELECT "leave_requests.reason already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_contact = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'contact_during_absence'
);
SET @sql = IF(@has_contact = 0,
  'ALTER TABLE `leave_requests` ADD COLUMN `contact_during_absence` VARCHAR(100) NULL AFTER `reason`',
  'SELECT "leave_requests.contact_during_absence already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_remarks = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'remarks'
);
SET @sql = IF(@has_remarks = 0,
  'ALTER TABLE `leave_requests` ADD COLUMN `remarks` TEXT NULL AFTER `contact_during_absence`',
  'SELECT "leave_requests.remarks already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_pdf_file = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'pdf_file_id'
);
SET @sql = IF(@has_pdf_file = 0,
  'ALTER TABLE `leave_requests` ADD COLUMN `pdf_file_id` VARCHAR(255) NULL COMMENT "Generated PDF with QR code" AFTER `remarks`',
  'SELECT "leave_requests.pdf_file_id already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_qr = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'qr_code'
);
SET @sql = IF(@has_qr = 0,
  'ALTER TABLE `leave_requests` ADD COLUMN `qr_code` VARCHAR(500) NULL COMMENT "QR code data for leave authorization" AFTER `pdf_file_id`',
  'SELECT "leave_requests.qr_code already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3. Create leave attachment table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `leave_request_attachments` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `leave_request_id`      INT UNSIGNED NOT NULL,
  `file_id`               VARCHAR(255) NOT NULL,
  `file_name`             VARCHAR(255) NOT NULL,
  `file_type`             VARCHAR(50) NOT NULL COMMENT "e.g., PDF, Image, Document",
  `file_size`             INT UNSIGNED NOT NULL,
  `attachment_type`       VARCHAR(50) NOT NULL COMMENT "e.g., Medical Certificate, Travel Document",
  `uploaded_at`           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  CONSTRAINT `fk_lra_request` FOREIGN KEY (`leave_request_id`) REFERENCES `leave_requests`(`id`) ON DELETE CASCADE,
  KEY `idx_lra_request` (`leave_request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Supporting documents for leave requests';

-- ── 4. Create leave request notifications table ──────────────────────────────
CREATE TABLE IF NOT EXISTS `leave_notifications` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `leave_request_id`      INT UNSIGNED NOT NULL,
  `recipient_id`          INT UNSIGNED NOT NULL,
  `notification_type`     ENUM("Submitted", "Approved", "Rejected", "Changes Requested", "Pending Approval") NOT NULL,
  `message`               TEXT NULL,
  `sent_at`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at`               TIMESTAMP NULL,
  `is_read`               TINYINT(1) DEFAULT 0,

  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ln_request` FOREIGN KEY (`leave_request_id`) REFERENCES `leave_requests`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ln_recipient` FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  KEY `idx_ln_recipient_read` (`recipient_id`, `is_read`),
  KEY `idx_ln_type` (`notification_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Leave request notifications for supervisors and HR';

-- ── 5. Ensure leave types are properly configured ──────────────────────────
INSERT IGNORE INTO `leave_types` (`name`, `slug`, `description`, `max_days_per_year`) VALUES
  ('Annual Leave', 'annual', 'Regular annual/vacation leave', 21),
  ('Sick Leave', 'sick', 'Sick leave due to illness', 30),
  ('Maternity Leave', 'maternity', 'Maternity leave for female employees', 84),
  ('Paternity Leave', 'paternity', 'Paternity leave for male employees', 10),
  ('Bereavement Leave', 'bereavement', 'Leave due to family death', 5),
  ('Training Leave', 'training', 'Leave for professional training and development', 15),
  ('Mission/Official Travel', 'mission', 'Official travel and mission leave', 30),
  ('Short Absence', 'short_absence', 'Short-term absence (half-day or less)', 5);

-- ── 6. Configure leave approval stages (supervisor → HR → Final) ──────────────
-- Get leave type IDs
SET @leave_type_id = (SELECT `id` FROM `leave_types` WHERE `slug` = 'annual' LIMIT 1);

-- Only insert if stages don't exist for this leave type
SET @stage_count = (SELECT COUNT(*) FROM `leave_approval_stages` WHERE `leave_type_id` = @leave_type_id);

IF @stage_count = 0 THEN
  -- Stage 1: Supervisor Review
  INSERT INTO `leave_approval_stages` (`leave_type_id`, `stage_order`, `stage_key`, `stage_label`, `required_permission_slug`, `is_final_approval`, `sla_hours`)
  VALUES (@leave_type_id, 1, 'supervisor_review', 'Supervisor Review', 'APPROVE_LEAVE_SUPERVISOR', 0, 48);

  -- Stage 2: HR Recommendation
  INSERT INTO `leave_approval_stages` (`leave_type_id`, `stage_order`, `stage_key`, `stage_label`, `required_permission_slug`, `is_final_approval`, `sla_hours`)
  VALUES (@leave_type_id, 2, 'hr_recommendation', 'HR Recommendation', 'APPROVE_LEAVE_HR', 0, 48);

  -- Stage 3: Final Authorization
  INSERT INTO `leave_approval_stages` (`leave_type_id`, `stage_order`, `stage_key`, `stage_label`, `required_permission_slug`, `is_final_approval`, `sla_hours`)
  VALUES (@leave_type_id, 3, 'final_authorization', 'Final Authorization', 'APPROVE_LEAVE_FINAL', 1, 24);
END IF;

-- ── 7. Create view for leave request summary (Excel export) ──────────────────
DROP VIEW IF EXISTS `v_leave_request_summary`;
CREATE VIEW `v_leave_request_summary` AS
SELECT
  lr.`id` AS request_id,
  u.`full_name` AS employee_name,
  u.`username` AS staff_id,
  d.`name` AS department,
  lt.`name` AS leave_type,
  lr.`start_date`,
  lr.`end_date`,
  DATEDIFF(lr.`end_date`, lr.`start_date`) + 1 AS days_requested,
  lr.`reason`,
  lr.`status`,
  lr.`current_stage_order` AS current_approval_stage,
  sup.`full_name` AS supervisor,
  lr.`contact_during_absence`,
  lr.`created_at` AS request_date
FROM `leave_requests` lr
JOIN `users` u ON u.`id` = lr.`user_id`
JOIN `leave_types` lt ON lt.`id` = lr.`leave_type_id`
LEFT JOIN `departments` d ON d.`id` = u.`department_id`
LEFT JOIN `users` sup ON sup.`id` = u.`supervisor_id`
ORDER BY lr.`created_at` DESC;

-- ── 8. Create indexes for leave queries ─────────────────────────────────────
SET @has_lb_idx = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_balances' AND INDEX_NAME = 'idx_lb_available'
);
SET @sql = IF(@has_lb_idx = 0,
  'ALTER TABLE `leave_balances` ADD INDEX `idx_lb_available` (`user_id`, `fiscal_year`, `available`)',
  'SELECT "idx_lb_available already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
