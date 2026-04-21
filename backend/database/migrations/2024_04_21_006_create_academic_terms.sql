-- Create academic_terms table
CREATE TABLE IF NOT EXISTS `academic_terms` (
    `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `academic_year_id` int(10) UNSIGNED NOT NULL,
    `label` varchar(50) NOT NULL,
    `start_date` date NOT NULL,
    `end_date` date NOT NULL,
    `is_current` tinyint(1) NOT NULL DEFAULT 0,
    `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (`id`),
    KEY `idx_academic_year_id` (`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert some default terms for the current academic year (2024/2025)
-- Assuming academic_year_id = 1 is 2024/2025 based on previous grep
INSERT INTO `academic_terms` (`academic_year_id`, `label`, `start_date`, `end_date`, `is_current`) VALUES
(1, 'Semester 1', '2024-09-01', '2025-02-28', 1),
(1, 'Semester 2', '2025-03-01', '2025-08-31', 0);
