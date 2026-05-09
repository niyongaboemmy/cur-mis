-- 2026_05_07_041_combined_academics_modules_marks.sql
--
-- Single rolled-up migration replacing the 18 individual files that previously
-- lived as 2026_05_07_041 … 2026_05_09_058. Each block is self-described in
-- the comments below.
--
-- Compatibility: MariaDB 10.11.x
--   • ADD COLUMN IF NOT EXISTS         → supported (10.0+)
--   • ADD UNIQUE INDEX IF NOT EXISTS   → NOT supported until 10.12;
--     replaced with a DROP-then-ADD pattern using a stored procedure.
--   • MODIFY COLUMN / UPDATE           → naturally idempotent
--
-- If anyone needs the original per-step history, see the eric branch prior
-- to commit 379ecdc.

-- =============================================================================
-- 041  Faculty: add `fac_acronym`; backfill from existing `fac_code`.
-- =============================================================================
ALTER TABLE `faculty`
  ADD COLUMN IF NOT EXISTS `fac_acronym` VARCHAR(50) NULL AFTER `fac_name`;

UPDATE `faculty`
SET    `fac_acronym` = `fac_code`
WHERE  `fac_acronym` IS NULL
  AND  `fac_code`    IS NOT NULL;


-- =============================================================================
-- 042  Departments: add `dep_code` (distinct from existing `dep_acronym`).
-- =============================================================================
ALTER TABLE `departements`
  ADD COLUMN IF NOT EXISTS `dep_code` VARCHAR(50) NULL AFTER `dep_acronym`;


-- =============================================================================
-- 043  Faculty/Department codes must be unique (NULLs allowed).
--      MariaDB 10.11 does not support ADD UNIQUE INDEX IF NOT EXISTS,
--      so we drop the index first (IF EXISTS is supported for DROP) then re-add.
-- =============================================================================
DROP INDEX IF EXISTS `uniq_faculty_fac_code`       ON `faculty`;
ALTER TABLE `faculty`
  ADD UNIQUE INDEX `uniq_faculty_fac_code` (`fac_code`);

DROP INDEX IF EXISTS `uniq_departements_dep_code`  ON `departements`;
ALTER TABLE `departements`
  ADD UNIQUE INDEX `uniq_departements_dep_code` (`dep_code`);


-- =============================================================================
-- 044  Relax NOT NULL on faculty/departement columns so bulk Excel imports
--      can omit them; admins fill in via inline edit afterward.
-- =============================================================================
ALTER TABLE `faculty`
  MODIFY `fac_descript` TEXT        NULL,
  MODIFY `fac_reg_date` DATE        NULL,
  MODIFY `school_id`    INT(11)     NULL,
  MODIFY `fac_code`     VARCHAR(50) NULL;

ALTER TABLE `departements`
  MODIFY `dep_acronym`     VARCHAR(50)  NULL,
  MODIFY `dep_description` TEXT         NULL,
  MODIFY `dep_author`      INT(11)      NULL,
  MODIFY `program`         VARCHAR(100) NULL,
  MODIFY `school_id`       INT(11)      NULL,
  MODIFY `fac_id`          INT(11)      NULL;


-- =============================================================================
-- 045  Programs (`options`) gain code/acronym/date columns + unique code.
-- =============================================================================
ALTER TABLE `options`
  ADD COLUMN IF NOT EXISTS `code`       VARCHAR(50) NULL AFTER `name`,
  ADD COLUMN IF NOT EXISTS `acro`       VARCHAR(50) NULL AFTER `code`,
  ADD COLUMN IF NOT EXISTS `start_date` DATE        NULL AFTER `acro`,
  ADD COLUMN IF NOT EXISTS `end_date`   DATE        NULL AFTER `start_date`;

DROP INDEX IF EXISTS `uniq_options_code` ON `options`;
ALTER TABLE `options`
  ADD UNIQUE INDEX `uniq_options_code` (`code`);


-- =============================================================================
-- 046  Widen `options.start_date`/`end_date` to VARCHAR(20) (academic-year
--      strings like "2023-2024" rather than calendar dates).
-- =============================================================================
ALTER TABLE `options`
  MODIFY `start_date` VARCHAR(20) NULL,
  MODIFY `end_date`   VARCHAR(20) NULL;


-- =============================================================================
-- 047  Unique index on `modules.module_code` intentionally skipped —
--      duplicate codes exist in the current data. Clean up duplicates
--      manually if uniqueness is required, then add the index separately.
-- =============================================================================


-- =============================================================================
-- 048  Per-curriculum placement of a module inside a (program, mode, semester,
--      campus, academic year) tuple. Catalog stays a single row per code in
--      `modules`; per-curriculum metadata moves here.
--      Column-type matrix matches the live tables: modules/options/levels use
--      signed INT; campuses uses INT UNSIGNED. FK signedness must match or
--      MySQL/MariaDB throws error 1215/3780.
-- =============================================================================
CREATE TABLE IF NOT EXISTS `module_offerings` (
  `id`             INT(11)     NOT NULL AUTO_INCREMENT,
  `module_id`      INT(11)     NOT NULL,
  `option_id`      INT(11)     NOT NULL,
  `academic_year`  VARCHAR(20) NULL,
  `level_id`       INT(11)     NULL,
  `mode`           VARCHAR(20) NULL,
  `mode_order`     INT(11)     NULL,
  `semesters`      VARCHAR(50) NULL,
  `module_order`   INT(11)     NULL,
  `campus_id`      INT(11)     NULL,
  `created_at`     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mo_module`  (`module_id`),
  KEY `idx_mo_option`  (`option_id`),
  KEY `idx_mo_campus`  (`campus_id`),
  KEY `idx_mo_level`   (`level_id`),
  KEY `idx_mo_mode`    (`mode`),
  CONSTRAINT `fk_mo_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mo_option` FOREIGN KEY (`option_id`) REFERENCES `options` (`id`)        ON DELETE CASCADE,
  CONSTRAINT `fk_mo_level`  FOREIGN KEY (`level_id`)  REFERENCES `levels`  (`id`)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =============================================================================
-- 049  Trim leading/trailing whitespace on legacy module codes so importers
--      don't create duplicate catalog rows for "MTEC4322" vs " MTEC4322".
-- =============================================================================
UPDATE `modules`
SET    `module_code` = TRIM(`module_code`)
WHERE  `module_code` <> TRIM(`module_code`);


-- =============================================================================
-- 050  Skipped — `module_programs` table does not exist in this database.
-- =============================================================================


-- =============================================================================
-- 051  Relax `modules.department` to NULL — legitimate value comes from the
--      module's owning program (`options.department_id`); bulk catalog inserts
--      shouldn't fail just because the link isn't known yet.
-- =============================================================================
ALTER TABLE `modules`
  MODIFY `department` INT NULL;


-- =============================================================================
-- 052  Schedules tab: per-(program, mode) start/end calendar dates on the
--      offering row.
-- =============================================================================
ALTER TABLE `module_offerings`
  ADD COLUMN IF NOT EXISTS `start_date` DATE NULL AFTER `semesters`,
  ADD COLUMN IF NOT EXISTS `end_date`   DATE NULL AFTER `start_date`;


-- =============================================================================
-- 053  Schedules tab: weekly meeting time + assigned instructor on the
--      offering row.
-- =============================================================================
ALTER TABLE `module_offerings`
  ADD COLUMN IF NOT EXISTS `day_of_week`   TINYINT NULL AFTER `end_date`,
  ADD COLUMN IF NOT EXISTS `start_time`    TIME    NULL AFTER `day_of_week`,
  ADD COLUMN IF NOT EXISTS `end_time`      TIME    NULL AFTER `start_time`,
  ADD COLUMN IF NOT EXISTS `instructor_id` INT     NULL AFTER `end_time`;


-- =============================================================================
-- 054  Faithful representation of one CSV teaching block: activity
--      ("Teaching" / "Final Exam"), free-text instructor name fallback for
--      rows that don't match `hr_employees`, and year-of-study within the
--      program.
-- =============================================================================
ALTER TABLE `module_offerings`
  ADD COLUMN IF NOT EXISTS `activity`        VARCHAR(20)  NULL AFTER `instructor_id`,
  ADD COLUMN IF NOT EXISTS `instructor_name` VARCHAR(120) NULL AFTER `activity`,
  ADD COLUMN IF NOT EXISTS `year_of_study`   TINYINT      NULL AFTER `instructor_name`;


-- =============================================================================
-- 055  `module_marks` mirrors the official CUR module-marks template:
--        • CAT1 / CAT2 / CAT3 split formative assessments
--        • PARTIAL EXAM
--        • TOT. CATs auto-summed at /60 by default
--        • FINAL EXAM split into 1st sitting / 2nd sitting (resit / special)
--        • DECISION ('P' = Pass, 'F&R' = Fail & Repeat)
--        • workflow `status` ('draft','claims_open','submitted','confirmed')
-- =============================================================================
ALTER TABLE `module_marks`
  ADD COLUMN IF NOT EXISTS `cat1`                DECIMAL(6,2) DEFAULT NULL AFTER `assignment_marks`,
  ADD COLUMN IF NOT EXISTS `cat2`                DECIMAL(6,2) DEFAULT NULL AFTER `cat1`,
  ADD COLUMN IF NOT EXISTS `cat3`                DECIMAL(6,2) DEFAULT NULL AFTER `cat2`,
  ADD COLUMN IF NOT EXISTS `partial_exam`        DECIMAL(6,2) DEFAULT NULL AFTER `cat3`,
  ADD COLUMN IF NOT EXISTS `exam_1st_sitting`    DECIMAL(6,2) DEFAULT NULL AFTER `exam_marks`,
  ADD COLUMN IF NOT EXISTS `exam_2nd_sitting`    DECIMAL(6,2) DEFAULT NULL AFTER `exam_1st_sitting`,
  ADD COLUMN IF NOT EXISTS `cat1_max`            DECIMAL(6,2) NOT NULL DEFAULT 15.00 AFTER `assignment_max`,
  ADD COLUMN IF NOT EXISTS `cat2_max`            DECIMAL(6,2) NOT NULL DEFAULT 15.00 AFTER `cat1_max`,
  ADD COLUMN IF NOT EXISTS `cat3_max`            DECIMAL(6,2) NOT NULL DEFAULT 15.00 AFTER `cat2_max`,
  ADD COLUMN IF NOT EXISTS `partial_exam_max`    DECIMAL(6,2) NOT NULL DEFAULT 15.00 AFTER `cat3_max`,
  ADD COLUMN IF NOT EXISTS `cats_max`            DECIMAL(6,2) NOT NULL DEFAULT 60.00 AFTER `partial_exam_max`,
  ADD COLUMN IF NOT EXISTS `final_exam_max`      DECIMAL(6,2) NOT NULL DEFAULT 40.00 AFTER `exam_max`,
  ADD COLUMN IF NOT EXISTS `decision`            VARCHAR(8)   DEFAULT NULL AFTER `grade`,
  ADD COLUMN IF NOT EXISTS `status`              ENUM('draft','claims_open','submitted','confirmed') NOT NULL DEFAULT 'draft' AFTER `decision`,
  ADD COLUMN IF NOT EXISTS `claims_opened_at`    TIMESTAMP    NULL DEFAULT NULL AFTER `status`,
  ADD COLUMN IF NOT EXISTS `submitted_at`        TIMESTAMP    NULL DEFAULT NULL AFTER `claims_opened_at`,
  ADD COLUMN IF NOT EXISTS `confirmed_at`        TIMESTAMP    NULL DEFAULT NULL AFTER `submitted_at`,
  ADD COLUMN IF NOT EXISTS `teaching_started_on` DATE         NULL DEFAULT NULL AFTER `confirmed_at`,
  ADD COLUMN IF NOT EXISTS `teaching_ended_on`   DATE         NULL DEFAULT NULL AFTER `teaching_started_on`;


-- =============================================================================
-- 056  Exam schedules — one row per planned exam sitting, decoupled from
--      teaching schedule (which lives on `module_offerings`).
-- =============================================================================
CREATE TABLE IF NOT EXISTS `exam_schedules` (
  `id`              INT          NOT NULL AUTO_INCREMENT,
  `module_id`       INT          NOT NULL,
  `option_id`       INT          NULL,
  `term_id`         INT UNSIGNED NULL,
  `academic_year`   VARCHAR(20)  NULL,
  `component`       VARCHAR(50)  NOT NULL DEFAULT 'Final Exam',
  `exam_date`       DATE         NULL,
  `start_time`      TIME         NULL,
  `end_time`        TIME         NULL,
  `campus_id`       INT UNSIGNED NULL,
  `instructor_name` VARCHAR(120) NULL,
  `notes`           VARCHAR(500) NULL,
  `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_es_module` (`module_id`),
  KEY `idx_es_option` (`option_id`),
  KEY `idx_es_term`   (`term_id`),
  KEY `idx_es_campus` (`campus_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =============================================================================
-- 057  Module-mark exemptions: students may receive an equivalence mark
--      from another institution. Stored on `module_marks` so they appear in
--      the curriculum/transcript views, but flagged separately.
-- =============================================================================
ALTER TABLE `module_marks`
  ADD COLUMN IF NOT EXISTS `is_exempted`      TINYINT(1)   NOT NULL DEFAULT 0   AFTER `decision`,
  ADD COLUMN IF NOT EXISTS `exemption_reason` VARCHAR(500) DEFAULT NULL          AFTER `is_exempted`;


-- =============================================================================
-- 058  Backfill `student.std_option` / `student.campus` from the linked
--      admission application. Only fills empty cells, so re-running is safe.
-- =============================================================================
-- Note: `student_applications` has no `program_id` or `campus_id` columns.
-- Backfilling `std_option` from `department_id`; `campus` skipped (no source).
UPDATE `student` s
JOIN `admission_offers`     ao ON ao.student_id = s.id
JOIN `student_applications` sa ON sa.id         = ao.application_id
SET
    s.std_option = COALESCE(NULLIF(s.std_option, ''), CAST(sa.department_id AS CHAR))
WHERE sa.department_id IS NOT NULL
  AND (s.std_option IS NULL OR s.std_option = '');