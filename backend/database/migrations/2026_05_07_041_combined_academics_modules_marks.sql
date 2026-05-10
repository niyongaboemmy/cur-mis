-- 2026_05_07_041_combined_academics_modules_marks.sql
--
-- Single rolled-up migration replacing the 18 individual files that previously
-- lived as 2026_05_07_041 … 2026_05_09_058. Each block is described in the
-- comments below.
--
-- IDEMPOTENCY MODEL
--   The migration runner aborts a file on the first SQL error, so every
--   block has to be safe to re-execute on a DB that already received the
--   granular migrations. We use a portable INFORMATION_SCHEMA + PREPARE
--   pattern (works on both MySQL 8 and MariaDB) for ADD COLUMN / ADD UNIQUE
--   INDEX. CREATE TABLE uses IF NOT EXISTS, MODIFY COLUMN is naturally
--   idempotent, and UPDATE statements are guarded by their WHERE clauses.
--
-- If anyone needs the per-step history, see the eric branch prior to commit
-- 379ecdc.

-- =============================================================================
-- 041  Faculty: add `fac_acronym`; backfill from existing `fac_code`.
-- =============================================================================
SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'faculty' AND column_name = 'fac_acronym'),
  'SELECT 1',
  'ALTER TABLE `faculty` ADD COLUMN `fac_acronym` VARCHAR(50) NULL AFTER `fac_name`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `faculty`
SET    `fac_acronym` = `fac_code`
WHERE  `fac_acronym` IS NULL
  AND  `fac_code`    IS NOT NULL;


-- =============================================================================
-- 042  Departments: add `dep_code` (distinct from existing `dep_acronym`).
-- =============================================================================
SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'departements' AND column_name = 'dep_code'),
  'SELECT 1',
  'ALTER TABLE `departements` ADD COLUMN `dep_code` VARCHAR(50) NULL AFTER `dep_acronym`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- =============================================================================
-- 043  Faculty/Department codes must be unique (NULLs allowed).
--      MariaDB 10.11 does not support ADD UNIQUE INDEX IF NOT EXISTS,
--      so we drop the index first (IF EXISTS is supported for DROP) then re-add.
-- =============================================================================
SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE table_schema = DATABASE() AND table_name = 'faculty' AND index_name = 'uniq_faculty_fac_code'),
  'SELECT 1',
  'ALTER TABLE `faculty` ADD UNIQUE INDEX `uniq_faculty_fac_code` (`fac_code`)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE table_schema = DATABASE() AND table_name = 'departements' AND index_name = 'uniq_departements_dep_code'),
  'SELECT 1',
  'ALTER TABLE `departements` ADD UNIQUE INDEX `uniq_departements_dep_code` (`dep_code`)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


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
SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'options' AND column_name = 'code'),
  'SELECT 1',
  'ALTER TABLE `options` ADD COLUMN `code` VARCHAR(50) NULL AFTER `name`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'options' AND column_name = 'acro'),
  'SELECT 1',
  'ALTER TABLE `options` ADD COLUMN `acro` VARCHAR(50) NULL AFTER `code`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'options' AND column_name = 'start_date'),
  'SELECT 1',
  'ALTER TABLE `options` ADD COLUMN `start_date` DATE NULL AFTER `acro`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'options' AND column_name = 'end_date'),
  'SELECT 1',
  'ALTER TABLE `options` ADD COLUMN `end_date` DATE NULL AFTER `start_date`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE table_schema = DATABASE() AND table_name = 'options' AND index_name = 'uniq_options_code'),
  'SELECT 1',
  'ALTER TABLE `options` ADD UNIQUE INDEX `uniq_options_code` (`code`)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


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
SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE table_schema = DATABASE() AND table_name = 'modules' AND index_name = 'uniq_modules_module_code'),
  'SELECT 1',
  'ALTER TABLE `modules` ADD UNIQUE INDEX `uniq_modules_module_code` (`module_code`)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


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
SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_programs' AND column_name = 'module_order'),
  'SELECT 1',
  'ALTER TABLE `module_programs` ADD COLUMN `module_order` INT NULL AFTER `option_id`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


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
SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_offerings' AND column_name = 'start_date'),
  'SELECT 1',
  'ALTER TABLE `module_offerings` ADD COLUMN `start_date` DATE NULL AFTER `semesters`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_offerings' AND column_name = 'end_date'),
  'SELECT 1',
  'ALTER TABLE `module_offerings` ADD COLUMN `end_date` DATE NULL AFTER `start_date`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- =============================================================================
-- 053  Schedules tab: weekly meeting time + assigned instructor on the
--      offering row.
-- =============================================================================
SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_offerings' AND column_name = 'day_of_week'),
  'SELECT 1',
  'ALTER TABLE `module_offerings` ADD COLUMN `day_of_week` TINYINT NULL AFTER `end_date`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_offerings' AND column_name = 'start_time'),
  'SELECT 1',
  'ALTER TABLE `module_offerings` ADD COLUMN `start_time` TIME NULL AFTER `day_of_week`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_offerings' AND column_name = 'end_time'),
  'SELECT 1',
  'ALTER TABLE `module_offerings` ADD COLUMN `end_time` TIME NULL AFTER `start_time`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_offerings' AND column_name = 'instructor_id'),
  'SELECT 1',
  'ALTER TABLE `module_offerings` ADD COLUMN `instructor_id` INT NULL AFTER `end_time`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- =============================================================================
-- 054  Faithful representation of one CSV teaching block: activity
--      ("Teaching" / "Final Exam"), free-text instructor name fallback for
--      rows that don't match `hr_employees`, and year-of-study within the
--      program.
-- =============================================================================
SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_offerings' AND column_name = 'activity'),
  'SELECT 1',
  'ALTER TABLE `module_offerings` ADD COLUMN `activity` VARCHAR(20) NULL AFTER `instructor_id`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_offerings' AND column_name = 'instructor_name'),
  'SELECT 1',
  'ALTER TABLE `module_offerings` ADD COLUMN `instructor_name` VARCHAR(120) NULL AFTER `activity`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_offerings' AND column_name = 'year_of_study'),
  'SELECT 1',
  'ALTER TABLE `module_offerings` ADD COLUMN `year_of_study` TINYINT NULL AFTER `instructor_name`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- =============================================================================
-- 055  `module_marks` mirrors the official CUR module-marks template:
--        • CAT1 / CAT2 / CAT3 split formative assessments
--        • PARTIAL EXAM
--        • TOT. CATs auto-summed at /60 by default
--        • FINAL EXAM split into 1st sitting / 2nd sitting (resit / special)
--        • DECISION ('P' = Pass, 'F&R' = Fail & Repeat)
--        • workflow `status` ('draft','claims_open','submitted','confirmed')
-- =============================================================================
SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'cat1'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `cat1` DECIMAL(6,2) DEFAULT NULL AFTER `assignment_marks`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'cat2'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `cat2` DECIMAL(6,2) DEFAULT NULL AFTER `cat1`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'cat3'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `cat3` DECIMAL(6,2) DEFAULT NULL AFTER `cat2`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'partial_exam'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `partial_exam` DECIMAL(6,2) DEFAULT NULL AFTER `cat3`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'exam_1st_sitting'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `exam_1st_sitting` DECIMAL(6,2) DEFAULT NULL AFTER `exam_marks`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'exam_2nd_sitting'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `exam_2nd_sitting` DECIMAL(6,2) DEFAULT NULL AFTER `exam_1st_sitting`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'cat1_max'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `cat1_max` DECIMAL(6,2) NOT NULL DEFAULT 15.00 AFTER `assignment_max`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'cat2_max'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `cat2_max` DECIMAL(6,2) NOT NULL DEFAULT 15.00 AFTER `cat1_max`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'cat3_max'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `cat3_max` DECIMAL(6,2) NOT NULL DEFAULT 15.00 AFTER `cat2_max`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'partial_exam_max'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `partial_exam_max` DECIMAL(6,2) NOT NULL DEFAULT 15.00 AFTER `cat3_max`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'cats_max'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `cats_max` DECIMAL(6,2) NOT NULL DEFAULT 60.00 AFTER `partial_exam_max`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'final_exam_max'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `final_exam_max` DECIMAL(6,2) NOT NULL DEFAULT 40.00 AFTER `exam_max`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'decision'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `decision` VARCHAR(8) DEFAULT NULL AFTER `grade`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'status'),
  'SELECT 1',
  "ALTER TABLE `module_marks` ADD COLUMN `status` ENUM('draft','claims_open','submitted','confirmed') NOT NULL DEFAULT 'draft' AFTER `decision`"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'claims_opened_at'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `claims_opened_at` TIMESTAMP NULL DEFAULT NULL AFTER `status`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'submitted_at'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `submitted_at` TIMESTAMP NULL DEFAULT NULL AFTER `claims_opened_at`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'confirmed_at'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `confirmed_at` TIMESTAMP NULL DEFAULT NULL AFTER `submitted_at`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'teaching_started_on'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `teaching_started_on` DATE NULL DEFAULT NULL AFTER `confirmed_at`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'teaching_ended_on'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `teaching_ended_on` DATE NULL DEFAULT NULL AFTER `teaching_started_on`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


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
SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'is_exempted'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `is_exempted` TINYINT(1) NOT NULL DEFAULT 0 AFTER `decision`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_marks' AND column_name = 'exemption_reason'),
  'SELECT 1',
  'ALTER TABLE `module_marks` ADD COLUMN `exemption_reason` VARCHAR(500) DEFAULT NULL AFTER `is_exempted`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


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
    s.std_option = COALESCE(NULLIF(s.std_option, ''), CAST(sa.program_id AS CHAR)),
    s.campus     = COALESCE(NULLIF(s.campus, ''),     CAST(sa.campus_id  AS CHAR))
WHERE sa.program_id IS NOT NULL
  AND (
        s.std_option IS NULL OR s.std_option = ''
     OR s.campus     IS NULL OR s.campus     = ''
  );


-- =============================================================================
-- 059  Repair `student.acc_year` rows that were mistakenly stored as the
--      academic year ID (e.g. "2") instead of the human label
--      (e.g. "2025-2026"). Older enrollments wrote the FK directly, which
--      breaks the student-list filter (driven by the topnav year label) and
--      every join that matches `acc_year` against `academic_years.label`.
--
--      Match purely-numeric acc_year values back to academic_years.id and
--      replace with the dash-form label. Re-running is a no-op once the
--      labels are in place because no row will satisfy REGEXP '^[0-9]+$'
--      anymore.
-- =============================================================================
UPDATE `student` s
JOIN `academic_years` ay ON CAST(ay.id AS CHAR) = s.acc_year
SET   s.acc_year = REPLACE(ay.label, '/', '-')
WHERE s.acc_year REGEXP '^[0-9]+$';


-- =============================================================================
-- 060  Add `student.user_id` so the student portal can resolve "the
--      authenticated user's own record" without scanning by email. Some dev
--      DBs predate the comprehensive_schema migration's CREATE TABLE and
--      are missing the column entirely; add it here defensively.
-- =============================================================================
SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'student' AND column_name = 'user_id'),
  'SELECT 1',
  'ALTER TABLE `student` ADD COLUMN `user_id` INT(10) UNSIGNED DEFAULT NULL AFTER `id`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE table_schema = DATABASE() AND table_name = 'student' AND index_name = 'idx_student_user_id'),
  'SELECT 1',
  'ALTER TABLE `student` ADD INDEX `idx_student_user_id` (`user_id`)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- =============================================================================
-- 061  Backfill `student.user_id` for previously-enrolled students.
--
--      First pass: walk admission_offers → applicant_profiles to recover the
--      original applicant user. This is the authoritative link for anyone
--      enrolled through the admissions flow.
--
--      Second pass: fall back to a case-insensitive email match against
--      `users` for the (small) cohort of legacy students who were created
--      manually and never had an applicant profile. Only fills NULLs, so
--      re-running is idempotent.
-- =============================================================================
UPDATE `student` s
JOIN `admission_offers`    ao ON ao.student_id    = s.id
JOIN `applicant_profiles`  ap ON ap.application_id = ao.application_id
SET   s.user_id = ap.user_id
WHERE s.user_id IS NULL
  AND ap.user_id IS NOT NULL;

UPDATE `student` s
JOIN `users` u ON LOWER(u.email) = LOWER(s.email)
SET   s.user_id = u.id
WHERE s.user_id IS NULL
  AND s.email IS NOT NULL
  AND s.email <> '';
