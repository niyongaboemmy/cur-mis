-- Fix collation mismatch between student.regnumber (utf8mb4_unicode_ci)
-- and student_id columns in finance/fine/clearance tables (utf8mb4_general_ci).
-- Without this, any JOIN between these tables raises:
--   "Illegal mix of collations ... for operation '='"

ALTER TABLE `fee_payments`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci;

ALTER TABLE `fee_invoices`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci;

ALTER TABLE `fee_bursaries`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci;

ALTER TABLE `student_clearances`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci;

ALTER TABLE `student_fee_overrides`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci;

ALTER TABLE `fee_refunds`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci;

ALTER TABLE `fee_fines`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci;

ALTER TABLE `overdue_alerts`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci;
