-- 2026_04_27_033_create_option_campuses.sql
-- Many-to-many join between programs (`options`) and `campuses`.
-- A program may run on one or more campuses; each campus may host
-- many programs. Composite PK guards against duplicates and ON
-- DELETE CASCADE keeps the link table tidy when either side goes.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS `option_campuses` (
  `option_id` int          NOT NULL,
  `campus_id` int unsigned NOT NULL,
  `created_at` timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`option_id`, `campus_id`),
  KEY `idx_oc_campus` (`campus_id`),
  CONSTRAINT `fk_oc_option` FOREIGN KEY (`option_id`) REFERENCES `options` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_oc_campus` FOREIGN KEY (`campus_id`) REFERENCES `campuses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
