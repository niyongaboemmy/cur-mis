-- Migration 076: ensure the `student_ids` table exists with a working
-- AUTO_INCREMENT primary key.
--
-- Symptom this fixes:
--   POST /api/student-ids/issue  ->  500 {"success":false,"message":"Server error."}
--   (the "Issue card" button on a student's ID Card tab)
--
-- Cause: issuing a card reads/writes the `student_ids` table
-- (StudentIdController::issue -> StudentIdModel). On legacy/cPanel deployments
-- that table was either never created (migration 027 not applied) or imported
-- without AUTO_INCREMENT on `id` (the cPanel quirk that migration 066 fixed for
-- other feature tables). Either way the INSERT throws, surfacing as a generic
-- 500 "Server error." Local dev has the table correctly, so it only fails live.
--
-- Idempotent: CREATE IF NOT EXISTS + a MODIFY that is a no-op when `id` is
-- already AUTO_INCREMENT. Safe to re-run.

CREATE TABLE IF NOT EXISTS `student_ids` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`  INT(10) UNSIGNED NOT NULL,
  `issue_date`  DATE             NOT NULL,
  `expiry_date` DATE             NOT NULL,
  `barcode`     VARCHAR(60)      DEFAULT NULL,
  `is_active`   TINYINT(1)       NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sid_student_active` (`student_id`, `is_active`),
  KEY `idx_sid_barcode` (`barcode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Restore AUTO_INCREMENT if a pre-existing table lost it on import (no-op otherwise).
ALTER TABLE `student_ids` MODIFY `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT;
