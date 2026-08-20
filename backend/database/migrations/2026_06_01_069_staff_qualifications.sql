-- Migration 069: Staff Qualifications & Credentials Tracking (Gap 7)
-- Creates staff_qualifications table for academic degrees, professional
-- certifications, and teaching specialisations linked to employees.

CREATE TABLE IF NOT EXISTS `staff_qualifications` (
    `id`            INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `employee_id`   INT(10) UNSIGNED NOT NULL,
    `type`          ENUM('Academic','Certification','Teaching Specialisation') NOT NULL DEFAULT 'Academic',
    `title`         VARCHAR(255)  NOT NULL COMMENT 'Degree/cert title, e.g. MSc Computer Science',
    `institution`   VARCHAR(255)  DEFAULT NULL,
    `field_of_study` VARCHAR(255) DEFAULT NULL,
    `year_obtained`  YEAR         DEFAULT NULL,
    `grade_result`  VARCHAR(100)  DEFAULT NULL COMMENT 'e.g. First Class, Distinction',
    `description`   TEXT          DEFAULT NULL,
    `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_sq_employee` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
