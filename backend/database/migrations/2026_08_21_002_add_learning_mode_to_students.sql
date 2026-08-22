-- Add learning mode field to students table
-- Stores the student's enrollment mode (day, weekend, holiday) to filter available modules

ALTER TABLE `student`
ADD COLUMN `learning_mode` ENUM('day', 'weekend', 'holiday') DEFAULT 'day' AFTER `school_id`;

-- Set description for the new column (for documentation)
-- learning_mode: 'day' (default), 'weekend', or 'holiday' — determines which modules the student sees
