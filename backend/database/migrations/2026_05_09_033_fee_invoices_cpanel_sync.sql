    -- =============================================================================
    -- Migration 033: Sync fee_invoices live cPanel → target schema
    -- Date: 2026-05-09
    -- Differences detected by visual comparison of live vs dev table structures
    -- =============================================================================

    SET FOREIGN_KEY_CHECKS = 0;
    SET NAMES utf8mb4;

    -- -------------------------------------------------------------------------
    -- 1. invoice_number: varchar(25) latin1 nullable → varchar(30) utf8mb4 NOT NULL
    -- -------------------------------------------------------------------------
    UPDATE `fee_invoices` SET `invoice_number` = '' WHERE `invoice_number` IS NULL;
    ALTER TABLE `fee_invoices`
      MODIFY COLUMN `invoice_number` VARCHAR(30)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '';

    -- -------------------------------------------------------------------------
    -- 2. student_id: int(10) UNSIGNED → varchar(20) utf8mb4
    --    Existing integer values are cast to their string representation
    -- -------------------------------------------------------------------------
    ALTER TABLE `fee_invoices`
      MODIFY COLUMN `student_id` VARCHAR(20)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL;

    -- -------------------------------------------------------------------------
    -- 3. Add fee_structure_id (missing in live)
    -- -------------------------------------------------------------------------
    ALTER TABLE `fee_invoices`
      ADD COLUMN IF NOT EXISTS `fee_structure_id` INT(10) UNSIGNED NULL DEFAULT NULL
      AFTER `student_id`;

    -- -------------------------------------------------------------------------
    -- 4. Add description (missing in live)
    -- -------------------------------------------------------------------------
    ALTER TABLE `fee_invoices`
      ADD COLUMN IF NOT EXISTS `description` VARCHAR(200)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT ''
      AFTER `fee_type`;

    -- -------------------------------------------------------------------------
    -- 5. Rename bursary_amount → bursary_applied
    --    Step A: add new column, Step B: copy data, Step C: drop old column
    -- -------------------------------------------------------------------------
    ALTER TABLE `fee_invoices`
      ADD COLUMN IF NOT EXISTS `bursary_applied` DECIMAL(12,2) NOT NULL DEFAULT 0.00
      AFTER `amount_paid`;

    -- A static UPDATE referencing `bursary_amount` fails to even parse once the
    -- column no longer exists (unlike a JOIN guard, which only skips rows).
    -- Build and PREPARE the statement dynamically so it's skipped entirely
    -- when the column is already gone.
    SET @has_bursary_amount := (
      SELECT COUNT(*) FROM `information_schema`.`COLUMNS`
      WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'fee_invoices' AND `COLUMN_NAME` = 'bursary_amount'
    );
    SET @copy_sql := IF(@has_bursary_amount > 0,
      'UPDATE `fee_invoices` SET `bursary_applied` = `bursary_amount` WHERE `bursary_applied` = 0.00',
      'SELECT 1'
    );
    PREPARE _mig033_copy FROM @copy_sql;
    EXECUTE _mig033_copy;
    DEALLOCATE PREPARE _mig033_copy;

    ALTER TABLE `fee_invoices`
      DROP COLUMN IF EXISTS `bursary_amount`;

    -- -------------------------------------------------------------------------
    -- 6. fee_type: fix charset (values already match)
    -- -------------------------------------------------------------------------
    ALTER TABLE `fee_invoices`
      MODIFY COLUMN `fee_type` ENUM(
        'TUITION','REGISTRATION','ADMISSION','HOSTEL',
        'ACADEMIC_DOCUMENT','FINE','REPEAT_MODULE',
        'ARREARS','BURSARY_CREDIT','MODULE_FEE'
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL;

    -- -------------------------------------------------------------------------
    -- 7. status: fix charset
    -- -------------------------------------------------------------------------
    ALTER TABLE `fee_invoices`
      MODIFY COLUMN `status` ENUM('unpaid','partial','paid','overdue','waived','cancelled')
        CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'unpaid';

    -- -------------------------------------------------------------------------
    -- 8. Add is_system_generated (missing in live)
    -- -------------------------------------------------------------------------
    ALTER TABLE `fee_invoices`
      ADD COLUMN IF NOT EXISTS `is_system_generated` TINYINT(1) NOT NULL DEFAULT 0
      AFTER `status`;

    -- -------------------------------------------------------------------------
    -- 9. Add module_id (missing in live)
    -- -------------------------------------------------------------------------
    ALTER TABLE `fee_invoices`
      ADD COLUMN IF NOT EXISTS `module_id` INT(10) UNSIGNED NULL DEFAULT NULL
      AFTER `is_system_generated`;

    -- -------------------------------------------------------------------------
    -- 10. created_at: timestamp → datetime
    -- -------------------------------------------------------------------------
    ALTER TABLE `fee_invoices`
      MODIFY COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

    -- -------------------------------------------------------------------------
    -- 11. Add updated_at (missing in live)
    -- -------------------------------------------------------------------------
    ALTER TABLE `fee_invoices`
      ADD COLUMN IF NOT EXISTS `updated_at` DATETIME NOT NULL
        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

    -- -------------------------------------------------------------------------
    -- 12. created_by: nullable → NOT NULL (fill NULLs first)
    -- -------------------------------------------------------------------------
    UPDATE `fee_invoices` SET `created_by` = 0 WHERE `created_by` IS NULL;
    ALTER TABLE `fee_invoices`
      MODIFY COLUMN `created_by` INT(10) UNSIGNED NOT NULL DEFAULT 0;

    -- -------------------------------------------------------------------------
    -- 13. Drop program_id (not in target schema)
    -- -------------------------------------------------------------------------
    ALTER TABLE `fee_invoices` DROP COLUMN IF EXISTS `program_id`;

    -- -------------------------------------------------------------------------
    -- 14. Add FK for fee_structure_id if fee_structures exists
    -- -------------------------------------------------------------------------
    ALTER TABLE `fee_invoices` DROP FOREIGN KEY IF EXISTS `fk_fi_fee_structure`;
    ALTER TABLE `fee_invoices`
      ADD CONSTRAINT `fk_fi_fee_structure`
      FOREIGN KEY (`fee_structure_id`) REFERENCES `fee_structures` (`id`) ON DELETE SET NULL;

    SET FOREIGN_KEY_CHECKS = 1;
