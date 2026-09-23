-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 141: widen the `student` columns that enrollment writes into.
-- Date: 2026-08-18
--
-- WHY
-- ───
-- ApplicationService::initiateEnrollment() copies the applicant's faculty and
-- department NAMES onto the new student row. Those columns are varchar(40) and
-- varchar(50), while five of the eight postgraduate departments have names
-- longer than 50 characters ("Master of Publich Health in Community and
-- Environmental Health" is 62), and the longest faculty name is 44. Enrolling
-- any of those applicants fails on "Data too long for column 'program'" AFTER
-- the status has moved — which is how an application ends up marked enrolled
-- with no student row behind it.
--
-- This was survivable while enrollment was a button an admin pressed and
-- retried. Migration 140 makes enrollment run itself the moment the admission
-- fees are paid, so a truncation error there strands an applicant who has
-- already handed over their money. Widening the columns to comfortably clear
-- the longest live value closes it.
--
-- Idempotent — re-running simply re-applies the same definition.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE `student`
  MODIFY COLUMN `program` VARCHAR(150) DEFAULT NULL,
  MODIFY COLUMN `faculty` VARCHAR(150) NOT NULL;
