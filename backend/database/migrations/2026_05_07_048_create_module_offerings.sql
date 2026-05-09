-- 2026_05_07_048_create_module_offerings.sql
-- Each row in this table represents the placement of a module inside a
-- specific program for a given study mode (Day / Weekend / Holiday),
-- semester grouping ("S1&S2"), campus, and academic year. The catalog
-- module record (in `modules`) stays a single row keyed by `module_code`;
-- this table holds the per-curriculum metadata that varies row-to-row in
-- the university's curriculum spreadsheet.
--
-- Idempotent — duplicate-key errors are swallowed by the migration runner.

-- Column-type matrix matches the live tables: modules/options/levels use
-- signed INT; campuses uses INT UNSIGNED. FK definitions must match the
-- referenced column's signedness or MySQL throws error 3780.
CREATE TABLE IF NOT EXISTS `module_offerings` (
  `id`             INT          NOT NULL AUTO_INCREMENT,
  `module_id`      INT          NOT NULL,
  `option_id`      INT          NOT NULL,
  `academic_year`  VARCHAR(20)  NULL,
  `level_id`       INT          NULL,
  `mode`           VARCHAR(20)  NULL,
  `mode_order`     INT          NULL,
  `semesters`      VARCHAR(50)  NULL,
  `module_order`   INT          NULL,
  `campus_id`      INT UNSIGNED NULL,
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mo_module`  (`module_id`),
  KEY `idx_mo_option`  (`option_id`),
  KEY `idx_mo_campus`  (`campus_id`),
  KEY `idx_mo_level`   (`level_id`),
  KEY `idx_mo_mode`    (`mode`),
  CONSTRAINT `fk_mo_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mo_option` FOREIGN KEY (`option_id`) REFERENCES `options` (`id`)        ON DELETE CASCADE,
  CONSTRAINT `fk_mo_campus` FOREIGN KEY (`campus_id`) REFERENCES `campuses` (`id`)       ON DELETE SET NULL,
  CONSTRAINT `fk_mo_level`  FOREIGN KEY (`level_id`)  REFERENCES `levels` (`id`)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
