-- ============================================================
-- Migration 061 — Registry: saved column templates for the
-- Student Registry export modal.
--
-- A template is a named ordered list of column keys. Each user
-- owns their own templates (created_by) and the registry can
-- additionally surface "system" templates (created_by IS NULL,
-- is_system = 1) seeded from the controller for everyone to
-- pick. Columns is a JSON array of column-key strings so the
-- backend can drive the CSV generation and the frontend can
-- pre-tick the matching checkboxes when a template is loaded.
-- ============================================================

CREATE TABLE IF NOT EXISTS `student_export_templates` (
    `id`         INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    `name`       VARCHAR(120)     NOT NULL,
    `columns`    JSON             NOT NULL,
    `is_system`  TINYINT(1)       NOT NULL DEFAULT 0,
    `created_by` INT(10) UNSIGNED DEFAULT NULL,
    `created_at` TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_set_created_by` (`created_by`),
    KEY `idx_set_is_system`  (`is_system`),
    CONSTRAINT `fk_set_created_by`
        FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
