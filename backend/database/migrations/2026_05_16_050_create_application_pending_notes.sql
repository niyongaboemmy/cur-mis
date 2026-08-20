-- ============================================================
-- Migration 050 — Registry: shared "why is this pending" notes
-- recorded against an application. Visible to every registry
-- staff regardless of campus assignment so a colleague can
-- understand why a candidate is being held.
-- ============================================================

CREATE TABLE IF NOT EXISTS `application_pending_notes` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `application_id` INT UNSIGNED     NOT NULL,
    `note`           TEXT             NOT NULL,
    `created_by`     INT(10) UNSIGNED DEFAULT NULL,
    `created_at`     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_apn_application` (`application_id`),
    KEY `idx_apn_created_by`  (`created_by`),
    KEY `idx_apn_created_at`  (`created_at`),
    CONSTRAINT `fk_apn_application` FOREIGN KEY (`application_id`) REFERENCES `student_applications` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_apn_created_by`  FOREIGN KEY (`created_by`)     REFERENCES `users` (`id`)               ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
