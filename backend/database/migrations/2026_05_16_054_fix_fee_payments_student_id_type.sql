-- Migration 054: Fix fee_payments.student_id column type
--
-- The column was defined as int(10) unsigned in the original schema, but the
-- system stores student registration numbers (e.g. "CUR/BBA/001/2022") which
-- are varchar strings — matching fee_invoices.student_id (varchar 20).
--
-- FeePaymentModel::listWithDetails() joins on `s.regnumber = fp.student_id`
-- and filters by string regnumber, so the column must be VARCHAR.
--
-- Safe to re-run: MODIFY COLUMN to the same type is a no-op on re-run.

ALTER TABLE `fee_payments`
    MODIFY COLUMN `student_id` VARCHAR(20) NOT NULL;
