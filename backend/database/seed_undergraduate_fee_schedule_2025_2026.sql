-- ══════════════════════════════════════════════════════════════════════════════
-- ONE-OFF: load the official CUR undergraduate Academic Fees Structure, 2025/2026
-- (Rwandan and East African community students) into fee_structures.
--
-- Source: "fees structure for all Programs Signed" PDF (Registrar / Chief Accountant).
-- Programme rows only. Postgraduate (PGDE) rows are already seeded by
-- 2026_07_19_105_seed_postgraduate_fee_schedule.sql.
--
-- Also adds two columns to departements (programme duration in years and number of
-- internships), which the fee schedule PDF reads.
--
-- HOW TO RUN: phpMyAdmin, or `mysql < this file`, against the database you want.
-- Do NOT put this in database/migrations/: migrate-backend.yml would pick it up.
--
-- Safe to run more than once: columns are added only if missing, and a fee row is
-- inserted only if the same academic year / department / level / fee type is not
-- already active.
--
-- BEFORE RUNNING: the department names below must match departements.dep_name exactly.
-- The final SELECT lists any programme whose name did not match; fix those names in
-- the data block and re-run (already-inserted rows are skipped).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Columns the PDF reads ──────────────────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'departements' AND COLUMN_NAME = 'duration_years');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `departements` ADD COLUMN `duration_years` TINYINT UNSIGNED NULL DEFAULT NULL COMMENT ''Programme length in years''',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'departements' AND COLUMN_NAME = 'internship_count');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `departements` ADD COLUMN `internship_count` TINYINT UNSIGNED NULL DEFAULT NULL COMMENT ''Number of internships during the programme''',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 2. Programme data from the signed schedule ────────────────────────────────
-- level_name: NULL for programmes with one fee set; the two semester cohorts of the
-- Science & Education programmes use the existing levels (Level 8 , Semester (1&2) and
-- Level 8 , Semester (3&4)). Duration for Biomedical Laboratory Sciences is blank on the
-- PDF; 3 years is used because its per-year figure (800,000) is 2,400,000 / 3.
DROP TEMPORARY TABLE IF EXISTS _ug_prog;
CREATE TEMPORARY TABLE _ug_prog (
  dep_name      VARCHAR(200)  NOT NULL,
  level_name    VARCHAR(200)  NULL,
  duration      TINYINT       NULL,
  internships   TINYINT       NULL,
  app_fee       DECIMAL(12,2) NULL,
  reg_fee       DECIMAL(12,2) NOT NULL,
  cursu_fee     DECIMAL(12,2) NOT NULL,
  tuition       DECIMAL(12,2) NOT NULL,
  intern_fee    DECIMAL(12,2) NOT NULL,
  final_fee     DECIMAL(12,2) NOT NULL,
  grad_fee      DECIMAL(12,2) NOT NULL
);

INSERT INTO _ug_prog VALUES
  -- Faculty of Science and Technology
  ('Computer science',                                  'Level 8 , Semester (1&2)', 3, 1, 5000, 33000, 3000, 1650000, 30000, 150000, 50000),
  ('Computer science',                                  'Level 8 , Semester (3&4)', 3, 1, NULL, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('Bachelor of science in food processing',            NULL,                       4, 2, 5000, 33000, 3000, 2000000, 50000, 150000, 50000),
  -- Faculty of Social Work
  ('Bachelor of child and family studies',              NULL,                       3, 1, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('Bachelor of Welfare and social development',        NULL,                       3, 1, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  -- Faculty of Catechesis and Religious Sciences
  ('Catechesis',                                        NULL,                       3, 1, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('Religious Sciences',                                NULL,                       3, 1, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  -- Faculty of Business Studies
  ('Finance and Banking',                               NULL,                       3, 1, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('Accounting',                                        NULL,                       3, 1, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('Commercial Engineering',                            NULL,                       3, 1, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  -- Faculty of Education, education in sciences
  ('Education in Biology and Chemistry',                'Level 8 , Semester (1&2)', 4, 2, 5000, 33000, 3000, 1640000, 30000, 150000, 50000),
  ('Education in Biology and Chemistry',                'Level 8 , Semester (3&4)', 4, 2, NULL, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('Education in Mathematics and Computer Science',     'Level 8 , Semester (1&2)', 4, 2, 5000, 33000, 3000, 1640000, 30000, 150000, 50000),
  ('Education in Mathematics and Computer Science',     'Level 8 , Semester (3&4)', 4, 2, NULL, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('Education in Mathematics and Biology',              'Level 8 , Semester (1&2)', 4, 2, 5000, 33000, 3000, 1640000, 30000, 150000, 50000),
  ('Education in Mathematics and Biology',              'Level 8 , Semester (3&4)', 4, 2, NULL, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('Education in Mathematics and Chemistry',            'Level 8 , Semester (1&2)', 4, 2, 5000, 33000, 3000, 1640000, 30000, 150000, 50000),
  ('Education in Mathematics and Chemistry',            'Level 8 , Semester (3&4)', 4, 2, NULL, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('Education in Economics and Computer Science',       'Level 8 , Semester (1&2)', 4, 2, 5000, 33000, 3000, 1640000, 30000, 150000, 50000),
  ('Education in Economics and Computer Science',       'Level 8 , Semester (3&4)', 4, 2, NULL, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('Education in Mathematics and Geography',            'Level 8 , Semester (1&2)', 4, 2, 5000, 33000, 3000, 1640000, 30000, 150000, 50000),
  ('Education in Mathematics and Geography',            'Level 8 , Semester (3&4)', 4, 2, NULL, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('Education in Mathematics and Economics',            'Level 8 , Semester (1&2)', 4, 2, 5000, 33000, 3000, 1640000, 30000, 150000, 50000),
  ('Education in Mathematics and Economics',            'Level 8 , Semester (3&4)', 4, 2, NULL, 33000, 3000, 1500000, 30000, 150000, 50000),
  -- Faculty of Education, arts and social science (single fee set)
  ('English and Kinyarwanda',                           NULL,                       4, 2, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('English and French',                                NULL,                       4, 2, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('English and Kiswahili',                             NULL,                       4, 2, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('French and Kinyarwanda',                            NULL,                       4, 2, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('Economics and Entrepreneurship',                    NULL,                       4, 2, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('English and History',                               NULL,                       4, 2, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('Economics and History',                             NULL,                       4, 2, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('Economics and Geography',                           NULL,                       4, 2, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  ('Educational Management and Planning',               NULL,                       3, 2, 5000, 33000, 3000, 1500000, 30000, 150000, 50000),
  -- Faculty of Health Science
  ('Biomedical laboratory sciences',                    NULL,                       3, 3, 5000, 33000, 3000, 2400000, 160000, 150000, 50000),
  ('Public Health',                                     NULL,                       3, 3, 5000, 33000, 3000, 1760000, 50000, 150000, 50000),
  ('Human nutrition',                                   NULL,                       3, 3, 5000, 33000, 3000, 2000000, 50000, 150000, 50000),
  ('Midwifery',                                         NULL,                       4, 4, 5000, 33000, 3000, 2440000, 160000, 150000, 50000),
  ('Nursing',                                           NULL,                       4, 4, 5000, 33000, 3000, 2800000, 160000, 150000, 50000),
  ('Advanced Diploma in General Nursing',               NULL,                       3, 3, 5000, 33000, 3000, 2100000, 160000, 150000, 50000),
  ('Advanced Diploma in Midwifery',                     NULL,                       3, 3, 5000, 33000, 3000, 1830000, 160000, 150000, 50000);

-- ── 3. Programme duration and internship count onto the department rows ──────
UPDATE `departements` d
  JOIN (SELECT dep_name, MAX(duration) AS duration, MAX(internships) AS internships
          FROM _ug_prog GROUP BY dep_name) p ON p.dep_name = d.dep_name
   SET d.duration_years = p.duration,
       d.internship_count = p.internships;

-- ── 4. Fee rows for academic year 2025/2026 ──────────────────────────────────
-- Level resolved by name; NULL level = applies to the whole programme.
-- Each block skips rows that already exist as active rows.

INSERT INTO `fee_structures`
    (`academic_year_id`, `department_id`, `level_id`, `student_category`, `fee_type`, `label`, `amount`, `currency`, `semester`, `payment_plan`, `is_active`, `created_by`)
SELECT ay.id, d.dep_id, lv.id, NULL, 'APPLICATION', 'Application Fee', p.app_fee, 'RWF', NULL, 'full_year', 1, 0
  FROM _ug_prog p
  JOIN `academic_years` ay ON ay.label = '2025/2026'
  JOIN `departements` d    ON d.dep_name = p.dep_name
  LEFT JOIN `levels` lv    ON lv.name = p.level_name
 WHERE p.app_fee IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM `fee_structures` fs
                    WHERE fs.academic_year_id = ay.id AND fs.department_id = d.dep_id
                      AND fs.fee_type = 'APPLICATION' AND fs.is_active = 1
                      AND fs.level_id <=> lv.id);

INSERT INTO `fee_structures`
    (`academic_year_id`, `department_id`, `level_id`, `student_category`, `fee_type`, `label`, `amount`, `currency`, `semester`, `payment_plan`, `is_active`, `created_by`)
SELECT ay.id, d.dep_id, lv.id, NULL, 'REGISTRATION', 'Registration Fee + CURSU per year', p.reg_fee, 'RWF', NULL, 'full_year', 1, 0
  FROM _ug_prog p
  JOIN `academic_years` ay ON ay.label = '2025/2026'
  JOIN `departements` d    ON d.dep_name = p.dep_name
  LEFT JOIN `levels` lv    ON lv.name = p.level_name
 WHERE NOT EXISTS (SELECT 1 FROM `fee_structures` fs
                    WHERE fs.academic_year_id = ay.id AND fs.department_id = d.dep_id
                      AND fs.fee_type = 'REGISTRATION' AND fs.is_active = 1
                      AND fs.level_id <=> lv.id);

INSERT INTO `fee_structures`
    (`academic_year_id`, `department_id`, `level_id`, `student_category`, `fee_type`, `label`, `amount`, `currency`, `semester`, `payment_plan`, `is_active`, `created_by`)
SELECT ay.id, d.dep_id, lv.id, NULL, 'CURSU', 'CURSU Fee per year', p.cursu_fee, 'RWF', NULL, 'full_year', 1, 0
  FROM _ug_prog p
  JOIN `academic_years` ay ON ay.label = '2025/2026'
  JOIN `departements` d    ON d.dep_name = p.dep_name
  LEFT JOIN `levels` lv    ON lv.name = p.level_name
 WHERE NOT EXISTS (SELECT 1 FROM `fee_structures` fs
                    WHERE fs.academic_year_id = ay.id AND fs.department_id = d.dep_id
                      AND fs.fee_type = 'CURSU' AND fs.is_active = 1
                      AND fs.level_id <=> lv.id);

-- TUITION is the total tuition for the programme (or for the semester cohort).
INSERT INTO `fee_structures`
    (`academic_year_id`, `department_id`, `level_id`, `student_category`, `fee_type`, `label`, `amount`, `currency`, `semester`, `payment_plan`, `is_active`, `created_by`)
SELECT ay.id, d.dep_id, lv.id, NULL, 'TUITION', 'Total Tuition per programme', p.tuition, 'RWF', NULL, 'full_year', 1, 0
  FROM _ug_prog p
  JOIN `academic_years` ay ON ay.label = '2025/2026'
  JOIN `departements` d    ON d.dep_name = p.dep_name
  LEFT JOIN `levels` lv    ON lv.name = p.level_name
 WHERE NOT EXISTS (SELECT 1 FROM `fee_structures` fs
                    WHERE fs.academic_year_id = ay.id AND fs.department_id = d.dep_id
                      AND fs.fee_type = 'TUITION' AND fs.is_active = 1
                      AND fs.level_id <=> lv.id);

-- INTERNSHIP is the fee for one internship (see Number of internships on the department).
INSERT INTO `fee_structures`
    (`academic_year_id`, `department_id`, `level_id`, `student_category`, `fee_type`, `label`, `amount`, `currency`, `semester`, `payment_plan`, `is_active`, `created_by`)
SELECT ay.id, d.dep_id, lv.id, NULL, 'INTERNSHIP', 'Internship Fee per internship', p.intern_fee, 'RWF', NULL, 'full_year', 1, 0
  FROM _ug_prog p
  JOIN `academic_years` ay ON ay.label = '2025/2026'
  JOIN `departements` d    ON d.dep_name = p.dep_name
  LEFT JOIN `levels` lv    ON lv.name = p.level_name
 WHERE NOT EXISTS (SELECT 1 FROM `fee_structures` fs
                    WHERE fs.academic_year_id = ay.id AND fs.department_id = d.dep_id
                      AND fs.fee_type = 'INTERNSHIP' AND fs.is_active = 1
                      AND fs.level_id <=> lv.id);

INSERT INTO `fee_structures`
    (`academic_year_id`, `department_id`, `level_id`, `student_category`, `fee_type`, `label`, `amount`, `currency`, `semester`, `payment_plan`, `is_active`, `created_by`)
SELECT ay.id, d.dep_id, lv.id, NULL, 'FINAL_PROJECT', 'Final Project Fee', p.final_fee, 'RWF', NULL, 'full_year', 1, 0
  FROM _ug_prog p
  JOIN `academic_years` ay ON ay.label = '2025/2026'
  JOIN `departements` d    ON d.dep_name = p.dep_name
  LEFT JOIN `levels` lv    ON lv.name = p.level_name
 WHERE NOT EXISTS (SELECT 1 FROM `fee_structures` fs
                    WHERE fs.academic_year_id = ay.id AND fs.department_id = d.dep_id
                      AND fs.fee_type = 'FINAL_PROJECT' AND fs.is_active = 1
                      AND fs.level_id <=> lv.id);

INSERT INTO `fee_structures`
    (`academic_year_id`, `department_id`, `level_id`, `student_category`, `fee_type`, `label`, `amount`, `currency`, `semester`, `payment_plan`, `is_active`, `created_by`)
SELECT ay.id, d.dep_id, lv.id, NULL, 'GRADUATION', 'Graduation Fee', p.grad_fee, 'RWF', NULL, 'full_year', 1, 0
  FROM _ug_prog p
  JOIN `academic_years` ay ON ay.label = '2025/2026'
  JOIN `departements` d    ON d.dep_name = p.dep_name
  LEFT JOIN `levels` lv    ON lv.name = p.level_name
 WHERE NOT EXISTS (SELECT 1 FROM `fee_structures` fs
                    WHERE fs.academic_year_id = ay.id AND fs.department_id = d.dep_id
                      AND fs.fee_type = 'GRADUATION' AND fs.is_active = 1
                      AND fs.level_id <=> lv.id);

-- ── 5. Check: programmes whose name did not match a department ───────────────
SELECT p.dep_name AS unmatched_programme
  FROM _ug_prog p
  LEFT JOIN `departements` d ON d.dep_name = p.dep_name
 WHERE d.dep_id IS NULL
 GROUP BY p.dep_name;

-- Check: level names that did not match a level (rows then have level NULL)
SELECT DISTINCT p.level_name AS unmatched_level
  FROM _ug_prog p
  LEFT JOIN `levels` lv ON lv.name = p.level_name
 WHERE p.level_name IS NOT NULL AND lv.id IS NULL;

DROP TEMPORARY TABLE IF EXISTS _ug_prog;
