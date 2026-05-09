-- 2026_05_09_055_module_marks_cur_template.sql
-- Extend `module_marks` to mirror the official CUR module-marks template:
--   • CAT1, CAT2, CAT3 (split formative assessments)
--   • PARTIAL EXAM
--   • TOT. CATs auto-summed at /60 by default
--   • FINAL EXAM split into 1st sitting / 2nd sitting (resit / special)
--   • DECISION ('P' = Pass, 'F&R' = Fail & Repeat) auto-derived
--   • workflow `status` ('draft','claims_open','submitted','confirmed')
--
-- Idempotent — duplicate-column errors are swallowed by the migration runner.

ALTER TABLE `module_marks`
  ADD COLUMN `cat1`              DECIMAL(6,2) DEFAULT NULL AFTER `assignment_marks`,
  ADD COLUMN `cat2`              DECIMAL(6,2) DEFAULT NULL AFTER `cat1`,
  ADD COLUMN `cat3`              DECIMAL(6,2) DEFAULT NULL AFTER `cat2`,
  ADD COLUMN `partial_exam`      DECIMAL(6,2) DEFAULT NULL AFTER `cat3`,
  ADD COLUMN `exam_1st_sitting`  DECIMAL(6,2) DEFAULT NULL AFTER `exam_marks`,
  ADD COLUMN `exam_2nd_sitting`  DECIMAL(6,2) DEFAULT NULL AFTER `exam_1st_sitting`,
  ADD COLUMN `cat1_max`          DECIMAL(6,2) NOT NULL DEFAULT 15.00 AFTER `assignment_max`,
  ADD COLUMN `cat2_max`          DECIMAL(6,2) NOT NULL DEFAULT 15.00 AFTER `cat1_max`,
  ADD COLUMN `cat3_max`          DECIMAL(6,2) NOT NULL DEFAULT 15.00 AFTER `cat2_max`,
  ADD COLUMN `partial_exam_max`  DECIMAL(6,2) NOT NULL DEFAULT 15.00 AFTER `cat3_max`,
  ADD COLUMN `cats_max`          DECIMAL(6,2) NOT NULL DEFAULT 60.00 AFTER `partial_exam_max`,
  ADD COLUMN `final_exam_max`    DECIMAL(6,2) NOT NULL DEFAULT 40.00 AFTER `exam_max`,
  ADD COLUMN `decision`          VARCHAR(8)   DEFAULT NULL AFTER `grade`,
  ADD COLUMN `status`            ENUM('draft','claims_open','submitted','confirmed') NOT NULL DEFAULT 'draft' AFTER `decision`,
  ADD COLUMN `claims_opened_at`  TIMESTAMP NULL DEFAULT NULL AFTER `status`,
  ADD COLUMN `submitted_at`      TIMESTAMP NULL DEFAULT NULL AFTER `claims_opened_at`,
  ADD COLUMN `confirmed_at`      TIMESTAMP NULL DEFAULT NULL AFTER `submitted_at`,
  ADD COLUMN `teaching_started_on` DATE NULL DEFAULT NULL AFTER `confirmed_at`,
  ADD COLUMN `teaching_ended_on`   DATE NULL DEFAULT NULL AFTER `teaching_started_on`;
