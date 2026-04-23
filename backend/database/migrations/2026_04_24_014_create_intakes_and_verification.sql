-- Create intakes table
CREATE TABLE IF NOT EXISTS `intakes` (
    `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` varchar(50) NOT NULL,
    `start_date` date NOT NULL,
    `end_date` date NOT NULL,
    `is_active` tinyint(1) NOT NULL DEFAULT 1,
    `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
    `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert some default intakes
INSERT INTO `intakes` (`name`, `start_date`, `end_date`, `is_active`) VALUES
('2026-A (January)', '2026-01-01', '2026-06-30', 1),
('2026-B (August)', '2026-08-01', '2026-12-31', 1);

-- Add email_verified and verification_code to student_applications
ALTER TABLE `student_applications`
ADD COLUMN `email_verified` tinyint(1) NOT NULL DEFAULT 0 AFTER `status`,
ADD COLUMN `verification_code` varchar(10) DEFAULT NULL AFTER `email_verified`;
