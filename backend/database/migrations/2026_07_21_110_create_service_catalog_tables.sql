-- Migration 110: Public Service Request Platform — service catalog + configurable
-- multi-stage approval chain per service. See PUBLIC_SERVICE_REQUEST_RESEARCH.md §4.1-4.2
-- and PUBLIC_SERVICE_REQUEST_IMPLEMENTATION_PLAN.md §1.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS `service_catalog` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`                  VARCHAR(50) NOT NULL,
  `name`                  VARCHAR(150) NOT NULL,
  `slug`                  VARCHAR(150) NOT NULL,
  `category`              VARCHAR(100) NULL DEFAULT NULL,
  `short_description`     VARCHAR(500) NULL DEFAULT NULL,
  `full_description`      TEXT NULL DEFAULT NULL,
  `requirements`          JSON NULL DEFAULT NULL COMMENT 'Eligibility/requirements text, list of strings',
  `required_attachments`  JSON NULL DEFAULT NULL COMMENT '[{key,label,mime_types,max_size_kb,required}]',
  `document_template_type` VARCHAR(100) NOT NULL DEFAULT 'generic_service_letter',
  `fee_amount`            DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `fee_currency`          VARCHAR(10) NOT NULL DEFAULT 'RWF',
  `requires_payment`      TINYINT(1) NOT NULL DEFAULT 1,
  `payment_stage`         ENUM('after_final_approval','before_review') NOT NULL DEFAULT 'after_final_approval',
  `processing_sla_days`   SMALLINT UNSIGNED NULL DEFAULT NULL,
  `is_active`             TINYINT(1) NOT NULL DEFAULT 1,
  `created_by`            INT UNSIGNED NULL DEFAULT NULL,
  `updated_by`            INT UNSIGNED NULL DEFAULT NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_service_catalog_code` (`code`),
  UNIQUE KEY `uq_service_catalog_slug` (`slug`),
  KEY `idx_service_catalog_active` (`is_active`),
  CONSTRAINT `fk_service_catalog_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_service_catalog_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `service_catalog_stages` (
  `id`                        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `service_id`                INT UNSIGNED NOT NULL,
  `stage_order`               TINYINT UNSIGNED NOT NULL,
  `stage_key`                 VARCHAR(100) NOT NULL,
  `stage_label`                VARCHAR(150) NOT NULL,
  `required_permission_slug`  VARCHAR(100) NOT NULL,
  `stage_type`                ENUM('approval','payment') NOT NULL DEFAULT 'approval',
  `is_final_approval`         TINYINT(1) NOT NULL DEFAULT 0,
  `sla_hours`                 INT UNSIGNED NULL DEFAULT NULL,
  `created_at`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_service_catalog_stage_order` (`service_id`, `stage_order`),
  KEY `idx_service_catalog_stages_permission` (`required_permission_slug`),
  CONSTRAINT `fk_service_catalog_stages_service` FOREIGN KEY (`service_id`) REFERENCES `service_catalog` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
