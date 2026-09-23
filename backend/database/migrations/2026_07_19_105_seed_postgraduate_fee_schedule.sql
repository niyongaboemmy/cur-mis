-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Migration 105: Seed official CUR Postgraduate Studies fee schedule, Academic Year 2025-2026
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Source: signed Finance schedules "ACADEMIC FEES STRUCTURE FOR POSTGRADUATE STUDIES YEAR
-- 2025-2026" — (1) Rwandan and East African Community (EAC) students, (2) International students.
-- Both documents quote amounts in RWF (see each PDF's note "All fees are calculated in Rwandan
-- Francs"); the international sheet is NOT USD despite postgraduate_international_fee_structures'
-- default currency, so currency is set explicitly to RWF for both.
--
-- Local/EAC rows go into `fee_structures` (student_category = 'local', scoped to each postgraduate
-- department) so they surface in the existing Fee Rates screen. International rows go into
-- `postgraduate_international_fee_structures`, kept deliberately separate per the client's
-- instruction (see 2026_07_15_102_create_postgraduate_international_fee_structures.sql).
--
-- `departements.program_level` was never populated for the 7 existing postgraduate departments,
-- which silently breaks the "Postgraduate Department" dropdown filter on the PG/Intl Fees page
-- (frontend filters on program_level = 'postgraduate'). Backfilled here alongside the new
-- Counseling Psychology department.
--
-- One-time data seed; the migration ledger (schema_migrations) guarantees this file runs once.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

SET @ay := (SELECT id FROM `academic_years` WHERE `label` = '2025/2026' LIMIT 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- §1  Ensure "Master of Education in Counseling Psychology" department exists
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO `departements` (`dep_name`, `dep_description`, `fac_id`, `school_id`, `program`, `index_number`, `program_level`)
SELECT 'Master of Education in Counseling Psychology', 'Master of Education in Counseling Psychology', 6, 1, 'Weekend', 0, 'postgraduate'
WHERE NOT EXISTS (
  SELECT 1 FROM `departements` WHERE `dep_name` = 'Master of Education in Counseling Psychology'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- §2  Backfill program_level = 'postgraduate' on the existing Master's departments
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE `departements`
SET `program_level` = 'postgraduate'
WHERE `dep_name` IN (
  'Master of Education in French',
  'Master of Education in English',
  'Master of Education Technology and Instructional Design',
  'Master of Publich Health in Maternal and Child Health',
  'Master of Public Health in Epidemiology and Disease Control',
  'Master of Publich Health in Community and Environmental Health',
  'Master of Science in Human Nutrition',
  'Master of Education in Counseling Psychology'
) AND (`program_level` IS NULL OR `program_level` <> 'postgraduate');

-- Resolve postgraduate department ids
SET @d_counseling := (SELECT dep_id FROM `departements` WHERE dep_name = 'Master of Education in Counseling Psychology' LIMIT 1);
SET @d_french     := (SELECT dep_id FROM `departements` WHERE dep_name = 'Master of Education in French' LIMIT 1);
SET @d_english    := (SELECT dep_id FROM `departements` WHERE dep_name = 'Master of Education in English' LIMIT 1);
SET @d_tid        := (SELECT dep_id FROM `departements` WHERE dep_name = 'Master of Education Technology and Instructional Design' LIMIT 1);
SET @d_mch        := (SELECT dep_id FROM `departements` WHERE dep_name = 'Master of Publich Health in Maternal and Child Health' LIMIT 1);
SET @d_epi        := (SELECT dep_id FROM `departements` WHERE dep_name = 'Master of Public Health in Epidemiology and Disease Control' LIMIT 1);
SET @d_cev        := (SELECT dep_id FROM `departements` WHERE dep_name = 'Master of Publich Health in Community and Environmental Health' LIMIT 1);
SET @d_nut        := (SELECT dep_id FROM `departements` WHERE dep_name = 'Master of Science in Human Nutrition' LIMIT 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- §3  Local / EAC fee rows → fee_structures (student_category = 'local')
--     Per program: APPLICATION, REGISTRATION, CURSU, INTERNSHIP, TUITION (per semester), GRADUATION
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO `fee_structures`
  (`academic_year_id`, `department_id`, `level_id`, `student_category`, `fee_type`, `label`, `amount`, `currency`, `semester`, `payment_plan`)
SELECT * FROM (
  -- Counseling Psychology: 5,000 / 50,000 / 3,000 / 100,000 / 500,000 per sem / 50,000
  SELECT @ay AS academic_year_id, @d_counseling AS department_id, NULL AS level_id, 'local' AS student_category,
         'APPLICATION' AS fee_type, 'Application Fee' AS label, 5000.00 AS amount, 'RWF' AS currency, NULL AS semester, 'full_year' AS payment_plan
  UNION ALL SELECT @ay, @d_counseling, NULL, 'local', 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_counseling, NULL, 'local', 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_counseling, NULL, 'local', 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_counseling, NULL, 'local', 'TUITION',      'Tuition Fee',     500000.00, 'RWF', NULL, 'per_semester'
  UNION ALL SELECT @ay, @d_counseling, NULL, 'local', 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year'

  -- Education in French: tuition/sem 450,000
  UNION ALL SELECT @ay, @d_french, NULL, 'local', 'APPLICATION',  'Application Fee',   5000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_french, NULL, 'local', 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_french, NULL, 'local', 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_french, NULL, 'local', 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_french, NULL, 'local', 'TUITION',      'Tuition Fee',     450000.00, 'RWF', NULL, 'per_semester'
  UNION ALL SELECT @ay, @d_french, NULL, 'local', 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year'

  -- Education in English: tuition/sem 500,000
  UNION ALL SELECT @ay, @d_english, NULL, 'local', 'APPLICATION',  'Application Fee',   5000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_english, NULL, 'local', 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_english, NULL, 'local', 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_english, NULL, 'local', 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_english, NULL, 'local', 'TUITION',      'Tuition Fee',     500000.00, 'RWF', NULL, 'per_semester'
  UNION ALL SELECT @ay, @d_english, NULL, 'local', 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year'

  -- Education Technology and Instructional Design: tuition/sem 500,000
  UNION ALL SELECT @ay, @d_tid, NULL, 'local', 'APPLICATION',  'Application Fee',   5000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_tid, NULL, 'local', 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_tid, NULL, 'local', 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_tid, NULL, 'local', 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_tid, NULL, 'local', 'TUITION',      'Tuition Fee',     500000.00, 'RWF', NULL, 'per_semester'
  UNION ALL SELECT @ay, @d_tid, NULL, 'local', 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year'

  -- Public Health in Maternal and Child Health: tuition/sem 625,000
  UNION ALL SELECT @ay, @d_mch, NULL, 'local', 'APPLICATION',  'Application Fee',   5000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_mch, NULL, 'local', 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_mch, NULL, 'local', 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_mch, NULL, 'local', 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_mch, NULL, 'local', 'TUITION',      'Tuition Fee',     625000.00, 'RWF', NULL, 'per_semester'
  UNION ALL SELECT @ay, @d_mch, NULL, 'local', 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year'

  -- Public Health in Epidemiology and Disease Control: tuition/sem 625,000
  UNION ALL SELECT @ay, @d_epi, NULL, 'local', 'APPLICATION',  'Application Fee',   5000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_epi, NULL, 'local', 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_epi, NULL, 'local', 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_epi, NULL, 'local', 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_epi, NULL, 'local', 'TUITION',      'Tuition Fee',     625000.00, 'RWF', NULL, 'per_semester'
  UNION ALL SELECT @ay, @d_epi, NULL, 'local', 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year'

  -- Public Health in Community and Environmental Health: tuition/sem 625,000
  UNION ALL SELECT @ay, @d_cev, NULL, 'local', 'APPLICATION',  'Application Fee',   5000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_cev, NULL, 'local', 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_cev, NULL, 'local', 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_cev, NULL, 'local', 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_cev, NULL, 'local', 'TUITION',      'Tuition Fee',     625000.00, 'RWF', NULL, 'per_semester'
  UNION ALL SELECT @ay, @d_cev, NULL, 'local', 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year'

  -- Science in Human Nutrition: tuition/sem 625,000
  UNION ALL SELECT @ay, @d_nut, NULL, 'local', 'APPLICATION',  'Application Fee',   5000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_nut, NULL, 'local', 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_nut, NULL, 'local', 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_nut, NULL, 'local', 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, @d_nut, NULL, 'local', 'TUITION',      'Tuition Fee',     625000.00, 'RWF', NULL, 'per_semester'
  UNION ALL SELECT @ay, @d_nut, NULL, 'local', 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year'
) AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM `fee_structures` fs
  WHERE fs.academic_year_id = seed.academic_year_id
    AND fs.department_id    = seed.department_id
    AND fs.student_category = seed.student_category
    AND fs.fee_type         = seed.fee_type
);

-- ─────────────────────────────────────────────────────────────────────────────
-- §4  Shared "Other Fees / Document Fees" — identical on both PDFs, applies to
--     all postgraduate students regardless of category (department/category = NULL = all)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO `fee_structures`
  (`academic_year_id`, `department_id`, `level_id`, `student_category`, `fee_type`, `label`, `amount`, `currency`, `semester`, `payment_plan`)
SELECT * FROM (
  SELECT @ay AS academic_year_id, NULL AS department_id, NULL AS level_id, NULL AS student_category,
         'TO_WHOM' AS fee_type, 'To Whom It May Concern Fee' AS label, 5000.00 AS amount, 'RWF' AS currency, NULL AS semester, 'full_year' AS payment_plan
  UNION ALL SELECT @ay, NULL, NULL, NULL, 'ENGLISH_CERTIFICATE', 'English Certificate Fee',   5000.00, 'RWF', NULL, 'full_year'
  UNION ALL SELECT @ay, NULL, NULL, NULL, 'TRANSCRIPT',          'Transcript Fee (per copy)', 1000.00, 'RWF', NULL, 'full_year'
) AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM `fee_structures` fs
  WHERE fs.academic_year_id = seed.academic_year_id
    AND fs.department_id IS NULL
    AND fs.student_category IS NULL
    AND fs.fee_type = seed.fee_type
);

-- ─────────────────────────────────────────────────────────────────────────────
-- §5  International rows → postgraduate_international_fee_structures
--     Amounts quoted in RWF per the signed international schedule (currency overridden
--     from the table's USD default — see Phase 5 currency note in migration 102).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO `postgraduate_international_fee_structures`
  (`academic_year_id`, `department_id`, `level_id`, `fee_type`, `label`, `amount`, `currency`, `semester`, `payment_plan`, `nationality_region`, `surcharge_type`)
SELECT * FROM (
  -- Counseling Psychology: tuition/sem 575,000
  SELECT @ay AS academic_year_id, @d_counseling AS department_id, NULL AS level_id, 'APPLICATION' AS fee_type,
         'Application Fee' AS label, 5000.00 AS amount, 'RWF' AS currency, NULL AS semester, 'full_year' AS payment_plan,
         NULL AS nationality_region, 'none' AS surcharge_type
  UNION ALL SELECT @ay, @d_counseling, NULL, 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_counseling, NULL, 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_counseling, NULL, 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_counseling, NULL, 'TUITION',      'Tuition Fee',     575000.00, 'RWF', NULL, 'per_semester', NULL, 'none'
  UNION ALL SELECT @ay, @d_counseling, NULL, 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year', NULL, 'none'

  -- Education in French: tuition/sem 525,000
  UNION ALL SELECT @ay, @d_french, NULL, 'APPLICATION',  'Application Fee',   5000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_french, NULL, 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_french, NULL, 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_french, NULL, 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_french, NULL, 'TUITION',      'Tuition Fee',     525000.00, 'RWF', NULL, 'per_semester', NULL, 'none'
  UNION ALL SELECT @ay, @d_french, NULL, 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year', NULL, 'none'

  -- Education in English: tuition/sem 575,000
  UNION ALL SELECT @ay, @d_english, NULL, 'APPLICATION',  'Application Fee',   5000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_english, NULL, 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_english, NULL, 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_english, NULL, 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_english, NULL, 'TUITION',      'Tuition Fee',     575000.00, 'RWF', NULL, 'per_semester', NULL, 'none'
  UNION ALL SELECT @ay, @d_english, NULL, 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year', NULL, 'none'

  -- Education Technology and Instructional Design: tuition/sem 575,000
  UNION ALL SELECT @ay, @d_tid, NULL, 'APPLICATION',  'Application Fee',   5000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_tid, NULL, 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_tid, NULL, 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_tid, NULL, 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_tid, NULL, 'TUITION',      'Tuition Fee',     575000.00, 'RWF', NULL, 'per_semester', NULL, 'none'
  UNION ALL SELECT @ay, @d_tid, NULL, 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year', NULL, 'none'

  -- Public Health in Maternal and Child Health: tuition/sem 700,000
  UNION ALL SELECT @ay, @d_mch, NULL, 'APPLICATION',  'Application Fee',   5000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_mch, NULL, 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_mch, NULL, 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_mch, NULL, 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_mch, NULL, 'TUITION',      'Tuition Fee',     700000.00, 'RWF', NULL, 'per_semester', NULL, 'none'
  UNION ALL SELECT @ay, @d_mch, NULL, 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year', NULL, 'none'

  -- Public Health in Epidemiology and Disease Control: tuition/sem 700,000
  UNION ALL SELECT @ay, @d_epi, NULL, 'APPLICATION',  'Application Fee',   5000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_epi, NULL, 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_epi, NULL, 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_epi, NULL, 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_epi, NULL, 'TUITION',      'Tuition Fee',     700000.00, 'RWF', NULL, 'per_semester', NULL, 'none'
  UNION ALL SELECT @ay, @d_epi, NULL, 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year', NULL, 'none'

  -- Public Health in Community and Environmental Health: tuition/sem 700,000
  UNION ALL SELECT @ay, @d_cev, NULL, 'APPLICATION',  'Application Fee',   5000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_cev, NULL, 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_cev, NULL, 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_cev, NULL, 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_cev, NULL, 'TUITION',      'Tuition Fee',     700000.00, 'RWF', NULL, 'per_semester', NULL, 'none'
  UNION ALL SELECT @ay, @d_cev, NULL, 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year', NULL, 'none'

  -- Science in Human Nutrition: tuition/sem 700,000
  UNION ALL SELECT @ay, @d_nut, NULL, 'APPLICATION',  'Application Fee',   5000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_nut, NULL, 'REGISTRATION', 'Registration Fee', 50000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_nut, NULL, 'CURSU',        'CURSU Fee',         3000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_nut, NULL, 'INTERNSHIP',   'Internship Fee',  100000.00, 'RWF', NULL, 'full_year', NULL, 'none'
  UNION ALL SELECT @ay, @d_nut, NULL, 'TUITION',      'Tuition Fee',     700000.00, 'RWF', NULL, 'per_semester', NULL, 'none'
  UNION ALL SELECT @ay, @d_nut, NULL, 'GRADUATION',   'Graduation Fee',   50000.00, 'RWF', NULL, 'full_year', NULL, 'none'
) AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM `postgraduate_international_fee_structures` pgifs
  WHERE pgifs.academic_year_id = seed.academic_year_id
    AND pgifs.department_id    = seed.department_id
    AND pgifs.fee_type         = seed.fee_type
);
