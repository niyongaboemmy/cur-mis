-- ============================================================
-- Migration 049 — Registry: user ↔ campus assignment table.
-- Registry assistants can be assigned to one or more campuses;
-- their application list is then auto-scoped to those campuses.
-- ============================================================

CREATE TABLE IF NOT EXISTS `user_campus_assignments` (
    `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`      INT(10) UNSIGNED NOT NULL,
    `campus_id`    INT UNSIGNED     NOT NULL,
    `assigned_by`  INT(10) UNSIGNED DEFAULT NULL,
    `assigned_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_uca_user_campus` (`user_id`, `campus_id`),
    KEY `idx_uca_user`    (`user_id`),
    KEY `idx_uca_campus`  (`campus_id`),
    CONSTRAINT `fk_uca_user`        FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`)     ON DELETE CASCADE,
    CONSTRAINT `fk_uca_campus`      FOREIGN KEY (`campus_id`)   REFERENCES `campuses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_uca_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
