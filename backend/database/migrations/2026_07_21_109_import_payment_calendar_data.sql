-- 2026_07_21_109_import_payment_calendar_data.sql
-- Data import for the redesigned Payment Calendar (see migration 108):
--   1. Carries forward any rows already in the legacy `payment_calendar_events`
--      table (flat milestone dates) into one "General Calendar" document per
--      academic year, then drops the legacy table.
--   2. Imports the two real schedules from
--      "PROPOSED PAYMENT CALENDAR 2025-2026.xlsx" — Faculty of Science and
--      Technology (Computer Science, L8) and Faculty of Education (combined
--      Education departments, L8) — as fully-formed documents with amounts,
--      notes, and signatures, matching the source workbook exactly.
-- Not safe to re-run blindly (would duplicate rows); the migration ledger
-- (schema_migrations) ensures this file only executes once.

-- ── 1. Carry forward legacy payment_calendar_events, then drop it ──────────────

SET @legacy_exists := (SELECT COUNT(*) FROM information_schema.TABLES
                        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_calendar_events');

SET @stmt := IF(@legacy_exists > 0,
  "INSERT INTO `payment_calendar_documents`
     (`academic_year_id`, `title`, `intake_label`, `notes`, `is_active`, `created_by`)
   SELECT DISTINCT `academic_year_id`, 'General Calendar Milestones', 'Carried forward from legacy calendar',
          'Auto-migrated from the previous flat payment-calendar-events list.', 1, NULL
   FROM `payment_calendar_events`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt := IF(@legacy_exists > 0,
  "INSERT INTO `payment_calendar_items`
     (`document_id`, `item_label`, `event_type`, `deadline_date`, `is_active`, `sort_order`)
   SELECT pcd.`id`, e.`label`, e.`event_type`, e.`event_date`, e.`is_active`, e.`id`
   FROM `payment_calendar_events` e
   JOIN `payment_calendar_documents` pcd
     ON pcd.`academic_year_id` = e.`academic_year_id`
    AND pcd.`title` = 'General Calendar Milestones'",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt := IF(@legacy_exists > 0, 'DROP TABLE `payment_calendar_events`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 2. Import the two official 2025-2026 schedules ──────────────────────────────

SET @ay_25_26 := (SELECT `id` FROM `academic_years` WHERE `label` = '2025/2026' LIMIT 1);
SET @fac_fst   := (SELECT `fac_id` FROM `faculty` WHERE `fac_acronym` = 'FST' LIMIT 1);
SET @fac_fed   := (SELECT `fac_id` FROM `faculty` WHERE `fac_acronym` = 'FED' LIMIT 1);

-- 2a. Faculty of Science and Technology — Department of Computer Science, L8

INSERT INTO `payment_calendar_documents`
  (`academic_year_id`, `faculty_id`, `title`, `intake_label`, `department_label`, `level_label`,
   `notes`, `bank_account_note`, `cursu_account_note`, `payment_method_note`, `fine_notice`,
   `prepared_by_name`, `prepared_by_title`, `verified_by_name`, `verified_by_title`,
   `approved_by_name`, `approved_by_title`, `is_active`)
VALUES
  (@ay_25_26, @fac_fst, 'PAYMENT CALENDAR ACADEMIC YEAR 2025-2026', 'September Intake 2025-2026',
   'Department of Computer Science', 'L8 S1&2',
   'Payment calendar was prepared basing on fee structure and academic calendar for year 2025-2026. This payment calendar is provisional and may be subjected to change after the teaching plan is available.',
   'The total amount of tuition and registration fees will be deposited on CUR bank account number: 00050-00329374-76 Bank of Kigali / Catholic University of Rwanda, or 4074200085641 Equity Bank / Catholic University of Rwanda.',
   'CURSU contribution will be deposited on CURSU bank account number: 00050-07752417-56 or 100025174482 Bank of Kigali.',
   'Paying by School gear is highly recommended: dial *700# or use student registration number at Equity Bank.',
   'Fines of 4% per month will be charged to the students who will not comply with the payment calendar.',
   'HAKIZIMANA Martin', 'Recovery Officer',
   'Jean Damascene NDAYISHIMIYE', 'Chief Accountant',
   'GASANGO Liliane', 'Director of Administration and Finance',
   1);

SET @doc_ict := LAST_INSERT_ID();

INSERT INTO `payment_calendar_items`
  (`document_id`, `group_label`, `item_label`, `event_type`, `start_date`, `deadline_date`, `amount`, `sort_order`)
VALUES
  (@doc_ict, 'L8 S1&2', 'Application fees + Registration fees + CURSU Contribution + Technology fees', 'registration_deadline', '2025-09-01', '2025-09-21', 41000.00, 1),
  (@doc_ict, 'L8 S1&2', 'First Payment Tuition fees',  'installment_due', '2025-10-05', '2025-11-05', 137500.00, 2),
  (@doc_ict, 'L8 S1&2', 'Second Payment Tuition fees', 'installment_due', '2025-11-05', '2026-01-05', 137500.00, 3),
  (@doc_ict, 'L8 S1&2', 'Third Payment Tuition fees',  'installment_due', '2026-01-05', '2026-03-05', 137500.00, 4),
  (@doc_ict, 'Start of L8 S3&4', 'Registration fees + CURSU Contribution + Technology fees', 'registration_deadline', '2026-04-01', '2026-05-10', 36000.00, 5),
  (@doc_ict, 'Start of L8 S3&4', 'First Payment Tuition fees', 'installment_due', '2026-05-05', '2026-07-05', 137500.00, 6);

-- 2b. Faculty of Education — combined departments, L8

INSERT INTO `payment_calendar_documents`
  (`academic_year_id`, `faculty_id`, `title`, `intake_label`, `department_label`, `level_label`,
   `notes`, `bank_account_note`, `cursu_account_note`, `payment_method_note`, `fine_notice`,
   `prepared_by_name`, `prepared_by_title`, `verified_by_name`, `verified_by_title`,
   `approved_by_name`, `approved_by_title`, `is_active`)
VALUES
  (@ay_25_26, @fac_fed, 'PAYMENT CALENDAR ACADEMIC YEAR 2025-2026', 'September Intake 2025-2026',
   'Biology and Chemistry, Mathematics and Biology, Mathematics and Computer Science, Mathematics and Chemistry, Economics and Computer Science, Mathematics and Geography, Mathematics and Economics',
   'L8 Semester 1&2',
   'Payment calendar was prepared based on Fee structure, Faculties Teaching plan and academic calendar for year 2025-2026.',
   'The total amount of tuition and registration fees will be deposited on CUR bank account number: 00050-00329374-76 Bank of Kigali / Catholic University of Rwanda, or 4074200085641 Equity Bank / Catholic University of Rwanda.',
   'CURSU contribution will be deposited on CURSU bank account number: 00050-07752417-56 or 100025174482 Bank of Kigali.',
   'Paying by School gear is highly recommended: dial *700# or use student registration number at Equity Bank.',
   'Fines of 4% per month will be charged to the students who will not comply with the payment calendar.',
   'HAKIZIMANA Martin', 'Recovery Officer',
   'Jean Damascene NDAYISHIMIYE', 'Chief Accountant',
   'Gasango Liliane', 'Director of Administration and Finance',
   1);

SET @doc_fed := LAST_INSERT_ID();

INSERT INTO `payment_calendar_items`
  (`document_id`, `group_label`, `item_label`, `event_type`, `start_date`, `deadline_date`, `amount`, `sort_order`)
VALUES
  (@doc_fed, 'L8 Semester 1&2', 'Application fees + Registration fees + CURSU Contribution + Technology fees', 'registration_deadline', '2025-09-01', '2025-09-21', 41000.00, 1),
  (@doc_fed, 'L8 Semester 1&2', 'First Payment',  'installment_due', '2025-09-22', '2025-11-22', 137000.00, 2),
  (@doc_fed, 'L8 Semester 1&2', 'Second Payment', 'installment_due', '2025-11-23', '2026-01-14', 137000.00, 3),
  (@doc_fed, 'L8 Semester 1&2', 'Third Payment',  'installment_due', '2026-01-15', '2026-03-10', 136000.00, 4);
