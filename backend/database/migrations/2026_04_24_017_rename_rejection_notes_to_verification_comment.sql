-- Migration: 2026_04_24_017_rename_rejection_notes_to_verification_comment
-- Renames the `rejection_notes` column to `verification_comment` to support comments for both approved and rejected statuses.

SET FOREIGN_KEY_CHECKS = 0;

SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_documents' AND COLUMN_NAME = 'rejection_notes'
);

SET @sql = IF(@col_exists > 0,
    'ALTER TABLE `application_documents` CHANGE `rejection_notes` `verification_comment` TEXT NULL COMMENT \'Comment explaining approval or rejection\'',
    'SELECT 1'
);
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

SET FOREIGN_KEY_CHECKS = 1;
