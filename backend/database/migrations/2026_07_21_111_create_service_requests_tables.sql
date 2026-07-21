-- Migration 111: service_requests + attachments + approval audit log.
-- See PUBLIC_SERVICE_REQUEST_RESEARCH.md §4.3.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS `service_requests` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `request_code`          VARCHAR(30) NOT NULL COMMENT 'Public tracking number, e.g. SR-2026-000123',
  `service_id`            INT UNSIGNED NOT NULL,
  `requester_type`        ENUM('student','applicant','public') NOT NULL DEFAULT 'student',
  `requester_user_id`     INT UNSIGNED NULL DEFAULT NULL,
  `student_regnumber`     VARCHAR(20) NULL DEFAULT NULL,
  `national_id`           VARCHAR(30) NULL DEFAULT NULL,
  `full_name`             VARCHAR(150) NOT NULL,
  `phone`                 VARCHAR(30) NULL DEFAULT NULL,
  `email`                 VARCHAR(150) NULL DEFAULT NULL,
  `form_data`             JSON NULL DEFAULT NULL,
  `current_stage_order`   TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `status`                ENUM(
                            'draft','submitted','in_review','changes_requested',
                            'approved','rejected','awaiting_payment','paid',
                            'completed','cancelled','expired'
                          ) NOT NULL DEFAULT 'draft',
  `invoice_id`            INT UNSIGNED NULL DEFAULT NULL,
  `document_generated_at` DATETIME NULL DEFAULT NULL,
  `download_token`        VARCHAR(64) NULL DEFAULT NULL,
  `downloaded_at`         DATETIME NULL DEFAULT NULL,
  `download_count`        INT UNSIGNED NOT NULL DEFAULT 0,
  `submitted_at`          DATETIME NULL DEFAULT NULL,
  `completed_at`          DATETIME NULL DEFAULT NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_service_requests_code` (`request_code`),
  UNIQUE KEY `uq_service_requests_download_token` (`download_token`),
  KEY `idx_service_requests_status` (`status`),
  KEY `idx_service_requests_service` (`service_id`),
  KEY `idx_service_requests_regnumber` (`student_regnumber`),
  KEY `idx_service_requests_invoice` (`invoice_id`),
  CONSTRAINT `fk_service_requests_service` FOREIGN KEY (`service_id`) REFERENCES `service_catalog` (`id`),
  CONSTRAINT `fk_service_requests_requester` FOREIGN KEY (`requester_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `service_request_attachments` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `service_request_id` INT UNSIGNED NOT NULL,
  `attachment_key`     VARCHAR(100) NOT NULL,
  `file_server_id`     VARCHAR(100) NOT NULL,
  `original_name`      VARCHAR(255) NOT NULL,
  `file_size`          INT UNSIGNED NULL DEFAULT NULL,
  `file_mime`          VARCHAR(100) NULL DEFAULT NULL,
  `uploaded_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sra_request` (`service_request_id`),
  CONSTRAINT `fk_sra_request` FOREIGN KEY (`service_request_id`) REFERENCES `service_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `service_request_approvals` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `service_request_id` INT UNSIGNED NOT NULL,
  `stage_order`        TINYINT UNSIGNED NOT NULL,
  `stage_key`          VARCHAR(100) NOT NULL,
  `actor_id`           INT UNSIGNED NULL DEFAULT NULL,
  `actor_name`         VARCHAR(150) NULL DEFAULT NULL,
  `actor_role`         VARCHAR(100) NULL DEFAULT NULL,
  `decision`           ENUM('submitted','approved','rejected','changes_requested','payment_confirmed') NOT NULL,
  `comment`            TEXT NULL DEFAULT NULL,
  `decided_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sra_approvals_request` (`service_request_id`),
  CONSTRAINT `fk_sra_approvals_request` FOREIGN KEY (`service_request_id`) REFERENCES `service_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
