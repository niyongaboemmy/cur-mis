-- Migration: Replace programs table with departements
-- Actual state: student_applications.department_id already exists (no FK),
--               merit_criteria/merit_lists still have program_id.
-- Date: 2026-04-23

-- ── 1. student_applications ──────────────────────────────────────────────────
-- department_id already renamed but is unsigned; change to signed to match dep_id

ALTER TABLE `student_applications`
    MODIFY `department_id` INT(11) NOT NULL;

ALTER TABLE `student_applications`
    ADD INDEX `idx_sa_dept_intake` (`department_id`, `intake`),
    ADD CONSTRAINT `fk_sa_dept`
        FOREIGN KEY (`department_id`) REFERENCES `departements` (`dep_id`);

-- ── 2. merit_criteria ────────────────────────────────────────────────────────

ALTER TABLE `merit_criteria`
    DROP FOREIGN KEY `fk_mc_program`,
    DROP INDEX `uq_mc_program_intake_year`;

ALTER TABLE `merit_criteria`
    CHANGE `program_id` `department_id` INT(11) NOT NULL;

ALTER TABLE `merit_criteria`
    ADD UNIQUE KEY `uq_mc_dept_intake_year` (`department_id`, `intake`, `academic_year_id`),
    ADD CONSTRAINT `fk_mc_dept`
        FOREIGN KEY (`department_id`) REFERENCES `departements` (`dep_id`);

-- ── 3. merit_lists ───────────────────────────────────────────────────────────
-- fk_ml_application uses uq_ml_app_program_intake for its application_id index;
-- add a standalone index first so the FK has something to rely on before we drop the unique key.

ALTER TABLE `merit_lists`
    ADD INDEX `idx_ml_application_id` (`application_id`);

ALTER TABLE `merit_lists`
    DROP INDEX `uq_ml_app_program_intake`,
    DROP INDEX `idx_ml_program_intake`;

ALTER TABLE `merit_lists`
    CHANGE `program_id` `department_id` INT(11) NOT NULL;

ALTER TABLE `merit_lists`
    ADD UNIQUE KEY `uq_ml_app_dept_intake` (`application_id`, `department_id`, `intake`),
    ADD INDEX `idx_ml_dept_intake` (`department_id`, `intake`, `academic_year_id`);

-- Remove the temporary standalone index now covered by the new unique key
ALTER TABLE `merit_lists`
    DROP INDEX `idx_ml_application_id`;

-- ── 4. Drop programs table ───────────────────────────────────────────────────
DROP TABLE IF EXISTS `programs`;
