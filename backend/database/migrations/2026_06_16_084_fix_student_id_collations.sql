-- Fix collation mismatch between student.regnumber (utf8mb4_unicode_ci)
-- and student_id columns in finance/fine/clearance tables (utf8mb4_general_ci).
-- Without this, any JOIN between these tables raises:
--   "Illegal mix of collations ... for operation '='"
--
-- Each ALTER is guarded by an INFORMATION_SCHEMA existence check + PREPARE so
-- a table that doesn't exist on a given environment (or was renamed — see
-- migration 090, which found `overdue_alerts` here should be
-- `fee_overdue_alerts`) is skipped instead of aborting the whole file.

SET @tbl := 'fee_payments';
SET @exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl);
SET @stmt := IF(@exists > 0, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @tbl := 'fee_invoices';
SET @exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl);
SET @stmt := IF(@exists > 0, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @tbl := 'fee_bursaries';
SET @exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl);
SET @stmt := IF(@exists > 0, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @tbl := 'student_clearances';
SET @exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl);
SET @stmt := IF(@exists > 0, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @tbl := 'student_fee_overrides';
SET @exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl);
SET @stmt := IF(@exists > 0, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @tbl := 'fee_refunds';
SET @exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl);
SET @stmt := IF(@exists > 0, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @tbl := 'fee_fines';
SET @exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl);
SET @stmt := IF(@exists > 0, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Real table name is `fee_overdue_alerts`, not `overdue_alerts`.
SET @tbl := 'fee_overdue_alerts';
SET @exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl);
SET @stmt := IF(@exists > 0, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
