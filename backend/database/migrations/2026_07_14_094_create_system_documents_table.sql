-- 2026_07_14_094_create_system_documents_table.sql
-- Create table for system-wide documents (fee structures, policies, etc.)
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS `system_documents` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `name`          VARCHAR(255) NOT NULL,
  `description`   TEXT NULL,
  `file_path`     VARCHAR(500) NOT NULL,
  `file_name`     VARCHAR(255) NOT NULL,
  `file_size`     INT UNSIGNED DEFAULT 0,
  `file_type`     VARCHAR(100) NOT NULL,
  `category`      VARCHAR(50) NOT NULL,
  `uploaded_by`   INT UNSIGNED NULL,
  `uploaded_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `is_active`     TINYINT(1) DEFAULT 1,
  `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_category` (`category`),
  KEY `idx_is_active` (`is_active`),
  KEY `idx_uploaded_by` (`uploaded_by`),
  FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
