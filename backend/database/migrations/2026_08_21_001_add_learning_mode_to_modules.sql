-- Add learning mode field to modules table
-- Allows courses to be categorized by delivery mode: Weekend, Day, Holiday

ALTER TABLE `modules`
ADD COLUMN `learning_mode` ENUM('day', 'weekend', 'holiday') DEFAULT 'day' AFTER `school_id`;

-- Set description for the new column (for documentation)
-- learning_mode: 'day' (default), 'weekend', or 'holiday' — determines which students see this module
