-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: HR Module Redesign - Contracts & Certificates
-- Date: 2026-09-04
--
-- Creates tables for:
-- - Employee contract management (Probation, Temporal, Part-time, Full-time)
-- - Contract notifications and renewal tracking
-- - Salary and Service certificates
-- - Certificate request and approval workflow
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Create contract types table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `contract_types` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`                  VARCHAR(100) NOT NULL UNIQUE,
  `code`                  VARCHAR(20) NOT NULL UNIQUE COMMENT "e.g., PROBATION, TEMPORAL, PARTTIME, FULLTIME",
  `description`           TEXT NULL,
  `default_duration_days` INT NULL COMMENT "Default contract duration in days",
  `is_renewable`          TINYINT(1) DEFAULT 1,
  `renewal_notice_days`   INT DEFAULT 30 COMMENT "Days before expiry to notify for renewal",
  `sort_order`            INT DEFAULT 0,
  `is_active`             TINYINT(1) DEFAULT 1,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_ct_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Employee contract types';

-- ── 2. Insert standard contract types ───────────────────────────────────────
INSERT IGNORE INTO `contract_types` (`name`, `code`, `description`, `default_duration_days`, `renewal_notice_days`, `sort_order`) VALUES
  ('Probation Period', 'PROBATION', 'Probation period for new employees', 90, 14, 10),
  ('Temporal (3 Months)', 'TEMPORAL_3M', 'Temporary contract for 3 months', 90, 14, 20),
  ('Temporal (1 Year)', 'TEMPORAL_1Y', 'Temporary contract for 1 year', 365, 30, 30),
  ('Part-Time', 'PARTTIME', 'Part-time employment contract', 365, 30, 40),
  ('Full-Time Indefinite', 'FULLTIME_IND', 'Permanent full-time employment', NULL, 30, 50);

-- ── 3. Create employee contracts table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS `employee_contracts` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`               INT UNSIGNED NOT NULL,
  `contract_type_id`      INT UNSIGNED NOT NULL,
  `contract_number`       VARCHAR(50) NULL UNIQUE,
  `start_date`            DATE NOT NULL,
  `end_date`              DATE NULL COMMENT "NULL means indefinite/active contract",
  `position_title`        VARCHAR(150) NOT NULL,
  `department_id`         INT UNSIGNED NOT NULL,
  `faculty_id`            INT UNSIGNED NULL,
  `employment_level`      VARCHAR(50) NULL COMMENT "e.g., Senior, Middle, Junior",
  `reporting_to_id`       INT UNSIGNED NULL COMMENT "Direct supervisor",
  `salary_grade`          VARCHAR(20) NULL,
  `approved_by`           INT UNSIGNED NULL,
  `approved_at`           TIMESTAMP NULL,
  `contract_file_id`      VARCHAR(255) NULL COMMENT "Path to contract document",
  `status`                ENUM("Draft", "Pending Approval", "Approved", "Active", "Expired", "Terminated") DEFAULT "Draft",
  `renewal_due_date`      DATE NULL COMMENT "Calculated as end_date - renewal_notice_days",
  `renewed_at`            TIMESTAMP NULL,
  `termination_reason`    VARCHAR(255) NULL,
  `termination_date`      DATE NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ec_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ec_type` FOREIGN KEY (`contract_type_id`) REFERENCES `contract_types`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ec_department` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ec_faculty` FOREIGN KEY (`faculty_id`) REFERENCES `faculties`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ec_reporting_to` FOREIGN KEY (`reporting_to_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ec_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `idx_ec_user` (`user_id`),
  KEY `idx_ec_status` (`status`),
  KEY `idx_ec_end_date` (`end_date`),
  KEY `idx_ec_renewal_due` (`renewal_due_date`),
  KEY `idx_ec_active` (`user_id`, `status`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Employee contract records';

-- ── 4. Create contract notifications/reminders ──────────────────────────────
CREATE TABLE IF NOT EXISTS `contract_notifications` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `contract_id`           INT UNSIGNED NOT NULL,
  `notification_type`     ENUM("Renewal Due", "Expiry", "Termination", "Renewal Approved", "Renewal Rejected") NOT NULL,
  `recipient_id`          INT UNSIGNED NOT NULL,
  `message`               TEXT NULL,
  `notification_date`     DATE NOT NULL,
  `sent_at`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_sent`               TINYINT(1) DEFAULT 0,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  CONSTRAINT `fk_cn_contract` FOREIGN KEY (`contract_id`) REFERENCES `employee_contracts`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cn_recipient` FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  KEY `idx_cn_type_date` (`notification_type`, `notification_date`),
  KEY `idx_cn_sent` (`is_sent`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Contract expiry and renewal notifications';

-- ── 5. Create certificate types table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS `certificate_types` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`                  VARCHAR(100) NOT NULL UNIQUE,
  `code`                  VARCHAR(20) NOT NULL UNIQUE COMMENT "e.g., SALARY_CERT, SERVICE_CERT",
  `description`           TEXT NULL,
  `template_file_id`      VARCHAR(255) NULL,
  `requires_approval`     TINYINT(1) DEFAULT 1,
  `is_active`             TINYINT(1) DEFAULT 1,
  `sort_order`            INT DEFAULT 0,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_ct_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Certificate types (Salary, Service, etc.)';

-- ── 6. Insert standard certificate types ────────────────────────────────────
INSERT IGNORE INTO `certificate_types` (`name`, `code`, `description`, `requires_approval`) VALUES
  ('Salary Certificate', 'SALARY_CERT', 'Certificate showing employee salary for a specific period', 1),
  ('Service Certificate', 'SERVICE_CERT', 'Certificate of employment and service duration', 1),
  ('Attendance Certificate', 'ATTENDANCE_CERT', 'Certificate of attendance/participation', 0),
  ('Training Certificate', 'TRAINING_CERT', 'Certificate of training completion', 0),
  ('Character Certificate', 'CHARACTER_CERT', 'Character certificate from employer', 1);

-- ── 7. Create certificate requests table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS `certificate_requests` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`               INT UNSIGNED NOT NULL,
  `certificate_type_id`   INT UNSIGNED NOT NULL,
  `requested_for_date`    DATE NOT NULL COMMENT "Period the certificate should cover",
  `requested_for_purpose` VARCHAR(255) NULL COMMENT "Reason for certificate request",
  `number_of_copies`      INT DEFAULT 1,
  `status`                ENUM("Requested", "Approved", "Rejected", "Generated", "Printed", "Collected", "Cancelled") DEFAULT "Requested",
  `approved_by`           INT UNSIGNED NULL,
  `approved_at`           TIMESTAMP NULL,
  `generated_file_id`     VARCHAR(255) NULL,
  `generated_at`          TIMESTAMP NULL,
  `collected_at`          TIMESTAMP NULL,
  `rejection_reason`      TEXT NULL,
  `notes`                 TEXT NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  CONSTRAINT `fk_cr_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cr_type` FOREIGN KEY (`certificate_type_id`) REFERENCES `certificate_types`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cr_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `idx_cr_user` (`user_id`),
  KEY `idx_cr_status` (`status`),
  KEY `idx_cr_date` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Employee certificate requests and tracking';

-- ── 8. Create certificate tracking/audit table ─────────────────────────────
CREATE TABLE IF NOT EXISTS `certificate_audit` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `certificate_request_id` INT UNSIGNED NOT NULL,
  `action`                VARCHAR(50) NOT NULL COMMENT "e.g., Generated, Printed, Collected, Voided",
  `action_by`             INT UNSIGNED NULL,
  `notes`                 TEXT NULL,
  `action_date`           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ca_request` FOREIGN KEY (`certificate_request_id`) REFERENCES `certificate_requests`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ca_action_by` FOREIGN KEY (`action_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `idx_ca_request` (`certificate_request_id`),
  KEY `idx_ca_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Audit trail for certificate generation and collection';

-- ── 9. Create view for contract expiry summary ─────────────────────────────
DROP VIEW IF EXISTS `v_contract_expiry_summary`;
CREATE VIEW `v_contract_expiry_summary` AS
SELECT
  ec.`id` AS contract_id,
  u.`full_name` AS employee_name,
  u.`username` AS staff_id,
  d.`name` AS department,
  ct.`name` AS contract_type,
  ec.`start_date`,
  ec.`end_date`,
  ec.`renewal_due_date`,
  ec.`status`,
  DATEDIFF(ec.`end_date`, CURDATE()) AS days_until_expiry,
  CASE
    WHEN ec.`end_date` IS NULL THEN 'Indefinite'
    WHEN DATEDIFF(ec.`end_date`, CURDATE()) < 0 THEN 'EXPIRED'
    WHEN DATEDIFF(ec.`renewal_due_date`, CURDATE()) <= 0 THEN 'RENEWAL DUE'
    WHEN DATEDIFF(ec.`end_date`, CURDATE()) <= 30 THEN 'EXPIRING SOON'
    ELSE 'ACTIVE'
  END AS renewal_status
FROM `employee_contracts` ec
JOIN `users` u ON u.`id` = ec.`user_id`
JOIN `contract_types` ct ON ct.`id` = ec.`contract_type_id`
JOIN `departments` d ON d.`id` = ec.`department_id`
WHERE ec.`status` IN ('Active', 'Approved')
ORDER BY ec.`renewal_due_date` ASC;
