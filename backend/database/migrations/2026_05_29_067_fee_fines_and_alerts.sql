-- ============================================================
-- Migration 067 — Fee Fines Management & Overdue Alert System
-- Gap 8: Automated Overdue Payment Alerts
-- Gap 9: Fines Management Module
-- ============================================================

-- ── 1. Fine records ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `fee_fines` (
  `id`          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `student_id`  VARCHAR(30)      NOT NULL,
  `fine_type`   ENUM(
                  'LATE_SUBMISSION',
                  'LOST_ID_CARD',
                  'LIBRARY_FINE',
                  'LATE_REGISTRATION',
                  'ACADEMIC_DOCUMENT',
                  'OTHER'
                ) NOT NULL DEFAULT 'OTHER',
  `reason`      VARCHAR(500)     NOT NULL,
  `amount`      DECIMAL(12,2)    NOT NULL DEFAULT 0.00,
  `status`      ENUM('pending','invoiced','waived','paid') NOT NULL DEFAULT 'pending',
  `invoice_id`  INT UNSIGNED     NULL,
  `notes`       TEXT             NULL,
  `issued_by`   INT UNSIGNED     NULL,
  `waived_by`   INT UNSIGNED     NULL,
  `waived_at`   DATETIME         NULL,
  `created_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fee_fines_student`  (`student_id`),
  KEY `idx_fee_fines_status`   (`status`),
  KEY `idx_fee_fines_invoice`  (`invoice_id`),
  CONSTRAINT `fk_fee_fines_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `fee_invoices` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. Overdue alert log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS `fee_overdue_alerts` (
  `id`          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `invoice_id`  INT UNSIGNED     NOT NULL,
  `student_id`  VARCHAR(30)      NOT NULL,
  `alert_level` ENUM('reminder','warning','final') NOT NULL DEFAULT 'reminder',
  `channel`     ENUM('email','system','both')       NOT NULL DEFAULT 'both',
  `sent_at`     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sent_by`     INT UNSIGNED     NULL,
  `email_sent`  TINYINT(1)       NOT NULL DEFAULT 0,
  `created_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_overdue_alerts_invoice` (`invoice_id`),
  KEY `idx_overdue_alerts_student` (`student_id`),
  KEY `idx_overdue_alerts_sent_at` (`sent_at`),
  CONSTRAINT `fk_overdue_alerts_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `fee_invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. New permissions ────────────────────────────────────────
INSERT IGNORE INTO `permissions` (`slug`, `description`, `created_at`) VALUES
  ('VIEW_FINES',       'View student fines list',                        NOW()),
  ('MANAGE_FINES',     'Issue, edit, waive, and delete student fines',   NOW()),
  ('SEND_FEE_ALERTS',  'Trigger overdue fee alert notifications',         NOW());
