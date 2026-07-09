-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Grade management permission + ensure a default grading scale exists.
-- Date: 2026-05-16
-- ──────────────────────────────────────────────────────────────────────────────

SET @exam_cat_id = (SELECT `id` FROM `permission_categories` WHERE `name` = 'Examinations' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES
    (@exam_cat_id, 'Manage Grading Scales', 'MANAGE_GRADING_SCALES', 'Configure grading scale bands, letter grades and grade points used for GPA/CGPA');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'MANAGE_GRADING_SCALES'
WHERE r.`name` IN ('superadmin', 'admin', 'registrar');

-- Some environments have `grading_scales.id` created without AUTO_INCREMENT
-- (fails INSERTs that don't specify it with "Field 'id' doesn't have a
-- default value"). Re-asserting this is a harmless no-op when already set.
ALTER TABLE `grading_scales` MODIFY `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT;

-- Seed a default 4.0-style grade-point scale only if the table is empty.
INSERT INTO `grading_scales` (`grade`, `min_marks`, `max_marks`, `grade_point`, `description`)
SELECT * FROM (
    SELECT 'A'  AS grade, 80.00 AS min_marks, 100.00 AS max_marks, 4.0 AS grade_point, 'Very Good' AS description UNION ALL
    SELECT 'B+',          75.00,              79.99,               3.5,               'Good Plus' UNION ALL
    SELECT 'B',           70.00,              74.99,               3.0,               'Good' UNION ALL
    SELECT 'C+',          65.00,              69.99,               2.5,               'Satisfactory Plus' UNION ALL
    SELECT 'C',           60.00,              64.99,               2.0,               'Satisfactory' UNION ALL
    SELECT 'D',           50.00,              59.99,               1.0,               'Pass' UNION ALL
    SELECT 'E',            0.00,              49.99,               0.0,               'Fail'
) AS seed
WHERE (SELECT COUNT(*) FROM `grading_scales`) = 0;
