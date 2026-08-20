-- Migration: fix module_marks.student_regnumber collation
-- Date: 2024-04-27
--
-- The original 020 migration was applied without an explicit collation, so
-- MySQL 8 created the column as utf8mb4_0900_ai_ci. That breaks JOINs against
-- `student.regnumber` / `module_registrations.student_regnumber`, both of
-- which are utf8mb4_general_ci. Re-align it here.

ALTER TABLE `module_marks`
  MODIFY `student_regnumber` VARCHAR(32)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL;
