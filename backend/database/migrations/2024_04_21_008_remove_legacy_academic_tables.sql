-- Migration: Remove legacy academic tables replaced by modules and newer entities
-- Date: 2024-04-21

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `courses`;
DROP TABLE IF EXISTS `course_assignments`;
DROP TABLE IF EXISTS `course_assignment`;
DROP TABLE IF EXISTS `enrollments`;
DROP TABLE IF EXISTS `exams`;
DROP TABLE IF EXISTS `exam_enrollments`;

SET FOREIGN_KEY_CHECKS = 1;
