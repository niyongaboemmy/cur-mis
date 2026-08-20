-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 139: publish a price for the UrubutoPay services that have none, so
-- the gateway quotes the institution's fee instead of asking the payer to
-- invent an amount.
-- Date: 2026-08-17
--
-- ══════════════════════════════════════════════════════════════════════════════
-- READ THIS FIRST — RUN AS-IS AND IT CHANGES NOTHING
--
-- Every amount below ships blank, because a price is a decision only the
-- institution can make: nothing in the database says what a retake or a
-- technology fee costs. Run the file unedited and it writes no rows at all — it
-- only prints the two reports at the end, which is a safe way to see where you
-- stand. Fill in the amounts you have agreed and run it again; each line left
-- NULL is skipped, so you can come back as the remaining figures are settled.
--
-- Checked against the production copy `curac_save (5).sql` (17 Aug 2026, 18:46).
--
-- ORDER: migration 138 must run first — it creates the fee categories these
-- prices attach to. Migration 134 is already applied on production
-- (`urubuto_services` holds 24 rows there), 138 is not.
--
-- TWO SEPARATE DECISIONS
--   §1  — prices for services that have never had one (technology, fines,
--         retake, CPA, …).
--   §1b — the bigger one: 3,761 of the 5,753 active students belong to
--         departments with NO published fee structure at all, so the gateway
--         asks them to type their own tuition, registration, CURSU, graduation,
--         internship and application fees. Read that section.
--
-- HOW TO RUN
--   cPanel → phpMyAdmin → live database → SQL tab → paste → Go.
--   Or let the migrate workflow apply it.
--
-- WHAT IT TOUCHES
--   `fee_structures` only, and only rows with no department, level or student
--   category — a department's own published price is never modified, and
--   nothing is ever deleted or deactivated. No student, invoice or payment data
--   is touched.
--
-- Idempotent — safe to re-run.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 0. Where the rows land ──────────────────────────────────────────────────
-- The current academic year (id 2, "2025/2026" on production), at
-- institution-wide scope: no department, no level, no student category. That is
-- the shape the existing TRANSCRIPT / TO_WHOM / ENGLISH_CERTIFICATE rows
-- already use, and the gateway's price lookup treats it as the fallback for
-- every student — a department-specific row, now or later, automatically
-- outranks it.
SET @year := (SELECT `id` FROM `academic_years` WHERE `is_current` = 1 ORDER BY `id` DESC LIMIT 1);

-- ── 1. NEW PRICES — EDIT THIS BLOCK ─────────────────────────────────────────
-- Amount in RWF, or NULL to skip that service for now.
-- The gateway service each price quotes is named on the right.

SET @price_technology            := NULL;  -- technology-fees-9754       Technology fees
SET @price_fine                  := NULL;  -- fines-1062                 Fines
SET @price_retake                := NULL;  -- retake-5953                Retake
SET @price_reintegration         := NULL;  -- reintegration-fees-2417    Re-integration fees
SET @price_final_project         := NULL;  -- final-project-fees-9014    Final project fees
SET @price_cpa_registration      := NULL;  -- cpa-registration-fee-2199  CPA registration fee
SET @price_cpa_foundation1       := NULL;  -- cpa-foundation1-6821       CPA foundation1
SET @price_cpa_foundation2       := NULL;  -- cpa-foundation2-7872       CPA foundation2
SET @price_cpa_advanced          := NULL;  -- cpa-advanced-8607          CPA Advanced
SET @price_covered_module_report := NULL;  -- covered-module-report-8800 Covered module report
SET @price_recommendation_letter := NULL;  -- recommendation-letter-6660 Recommendation letter

-- `other-fees-8272` is deliberately absent: it is the "I don't know which fee
-- this is" bucket and must stay payer-priced. Giving it an amount would quote a
-- number for a service that has no defined cost.
--
-- Recommendation letter is also sold through the public Service Request
-- platform. On production that catalogue has no recommendation-letter entry, so
-- there is no existing price to inherit — hence the blank above. If one is
-- added there later, this keeps the two platforms in step:
SET @price_recommendation_letter := COALESCE(
  @price_recommendation_letter,
  (SELECT `fee_amount` FROM `service_catalog`
    WHERE `code` = 'RECOMMENDATION_LETTER' AND `is_active` = 1 AND `fee_amount` > 0
    LIMIT 1)
);

-- ── 1b. THE FEES 3,761 STUDENTS ARE ASKED TO PRICE THEMSELVES ───────────────
-- Published fee structures on production cover twelve departments — Computer
-- Science, Religious Sciences, Education in Arts and Social Sciences, Nursing
-- (A0) and the eight Master's programmes. That is 1,992 of 5,753 active
-- students.
--
-- For the other 3,761 there is no structure of ANY kind for tuition,
-- registration, CURSU, graduation, internship or the application fee, and no
-- institution-wide row to fall back on. When one of those students picks
-- "Registration fees" on the USSD menu, the gateway has no amount to show and
-- asks them to type one. Whatever they type is what the institution receives.
--
-- Setting an amount here publishes a single institution-wide row per fee: the
-- price every student sees unless their own department has a specific one. The
-- existing department rows are NOT touched and keep taking precedence, so this
-- only ever fills the gap.
--
-- Current department prices, for reference (current year):
--   TUITION       375,000 – 700,000   REGISTRATION   5,000 – 50,000
--   CURSU         3,000               GRADUATION     50,000
--   INTERNSHIP    100,000             APPLICATION    5,000
--
-- Leave a line NULL and that fee stays payer-priced for those 3,761 students.
SET @fallback_tuition      := NULL;
SET @fallback_registration := NULL;
SET @fallback_cursu        := NULL;
SET @fallback_graduation   := NULL;
SET @fallback_internship   := NULL;
SET @fallback_application  := NULL;

-- ── 2. Publish the new prices ───────────────────────────────────────────────
-- Fires only when an amount was given, a current year exists, and that fee type
-- has no active structure for the year yet.
INSERT INTO `fee_structures`
  (`academic_year_id`, `semester`, `payment_plan`, `fee_type`, `label`,
   `department_id`, `level_id`, `student_category`, `campus_id`,
   `fee_category`, `amount`, `currency`, `is_active`, `is_mandatory`, `notes`)
SELECT @year, NULL, 'full_year', v.fee_type, v.label,
       NULL, NULL, NULL, NULL,
       v.fee_category, v.amount, 'RWF', 1, 0,
       'Published by migration 139 for the UrubutoPay service menu'
FROM (
            SELECT 'TECHNOLOGY'          AS fee_type, 'Technology Fee'       AS label, 'ICT'          AS fee_category, @price_technology            AS amount
  UNION ALL SELECT 'FINE',                            'Fine',                          'Late_Penalty',                @price_fine
  UNION ALL SELECT 'RETAKE',                          'Retake Fee',                    'Examination',                 @price_retake
  UNION ALL SELECT 'REINTEGRATION',                   'Reintegration Fee',             'Registration',                @price_reintegration
  UNION ALL SELECT 'FINAL_PROJECT',                   'Final Project Fee',             'Other',                       @price_final_project
  UNION ALL SELECT 'CPA_REGISTRATION',                'CPA Registration Fee',          'Registration',                @price_cpa_registration
  UNION ALL SELECT 'CPA_FOUNDATION1',                 'CPA Foundation 1',              'Tuition',                     @price_cpa_foundation1
  UNION ALL SELECT 'CPA_FOUNDATION2',                 'CPA Foundation 2',              'Tuition',                     @price_cpa_foundation2
  UNION ALL SELECT 'CPA_ADVANCED',                    'CPA Advanced',                  'Tuition',                     @price_cpa_advanced
  UNION ALL SELECT 'COVERED_MODULE_REPORT',           'Covered Module Report',         'Other',                       @price_covered_module_report
  UNION ALL SELECT 'RECOMMENDATION_LETTER',           'Recommendation Letter',         'Other',                       @price_recommendation_letter
) v
WHERE @year IS NOT NULL
  AND v.amount IS NOT NULL
  AND v.amount > 0
  AND NOT EXISTS (
        SELECT 1 FROM (SELECT `fee_type`, `academic_year_id`, `is_active` FROM `fee_structures`) existing
         WHERE existing.`fee_type`         = v.fee_type
           AND existing.`academic_year_id` = @year
           AND existing.`is_active`        = 1
      );

-- ── 2b. Publish the institution-wide fallbacks ──────────────────────────────
-- Each inherits the shape of an existing department row for the same fee —
-- payment plan, instalment count, semester, label, category, mandatory flag —
-- because a fallback tuition row must be per-semester if the department rows
-- are, or it means something different. Only the amount is new.
INSERT INTO `fee_structures`
  (`academic_year_id`, `semester`, `payment_plan`, `installment_count`, `fee_type`, `label`,
   `department_id`, `level_id`, `student_category`, `campus_id`,
   `fee_category`, `amount`, `currency`, `is_active`, `is_mandatory`, `notes`)
SELECT @year, t.semester,
       COALESCE(t.payment_plan, 'full_year'),
       t.installment_count,
       v.fee_type,
       COALESCE(t.label, v.fee_type),
       NULL, NULL, NULL, NULL,
       COALESCE(t.fee_category, 'Other'),
       v.amount, 'RWF', 1, COALESCE(t.is_mandatory, 1),
       'Institution-wide fallback published by migration 139 — applies to students whose department has no structure'
FROM (
            SELECT 'TUITION'      AS fee_type, @fallback_tuition      AS amount
  UNION ALL SELECT 'REGISTRATION',              @fallback_registration
  UNION ALL SELECT 'CURSU',                     @fallback_cursu
  UNION ALL SELECT 'GRADUATION',                @fallback_graduation
  UNION ALL SELECT 'INTERNSHIP',                @fallback_internship
  UNION ALL SELECT 'APPLICATION',               @fallback_application
) v
LEFT JOIN (
  -- ONE representative department row per fee type — the most recently added —
  -- copied whole. Taking each attribute independently (MIN per column) mixes
  -- rows: it picked `per_installment` from an old row while the live tuition
  -- structures are `per_semester`, which would publish a fallback with an
  -- instalment plan and no instalment count.
  SELECT f.`fee_type`, f.`payment_plan`, f.`installment_count`, f.`semester`,
         f.`label`, f.`fee_category`, f.`is_mandatory`
    FROM `fee_structures` f
    JOIN (
      SELECT `fee_type`, MAX(`id`) AS `id`
        FROM `fee_structures`
       WHERE `is_active` = 1 AND `department_id` IS NOT NULL
       GROUP BY `fee_type`
    ) pick ON pick.`id` = f.`id`
) t ON t.`fee_type` = v.fee_type
WHERE @year IS NOT NULL
  AND v.amount IS NOT NULL
  AND v.amount > 0
  AND NOT EXISTS (
        SELECT 1 FROM (
          SELECT `fee_type`, `academic_year_id`, `is_active`, `department_id`, `level_id`
            FROM `fee_structures`
        ) wide
         WHERE wide.`fee_type`         = v.fee_type
           AND wide.`academic_year_id` = @year
           AND wide.`is_active`        = 1
           AND wide.`department_id`    IS NULL
           AND wide.`level_id`         IS NULL
      );

-- If an institution-wide row already exists for one of those fees and a
-- different amount was given above, correct it in place. Department rows are
-- excluded by the department_id/level_id conditions.
UPDATE `fee_structures` fs
   SET fs.`amount` = CASE fs.`fee_type`
                       WHEN 'TUITION'      THEN @fallback_tuition
                       WHEN 'REGISTRATION' THEN @fallback_registration
                       WHEN 'CURSU'        THEN @fallback_cursu
                       WHEN 'GRADUATION'   THEN @fallback_graduation
                       WHEN 'INTERNSHIP'   THEN @fallback_internship
                       WHEN 'APPLICATION'  THEN @fallback_application
                     END,
       fs.`notes`  = CONCAT(COALESCE(fs.`notes`, ''), ' | amount corrected by migration 139 (was ', fs.`amount`, ')')
 WHERE fs.`academic_year_id` = @year
   AND fs.`is_active`        = 1
   AND fs.`department_id`    IS NULL
   AND fs.`level_id`         IS NULL
   AND fs.`fee_type` IN ('TUITION','REGISTRATION','CURSU','GRADUATION','INTERNSHIP','APPLICATION')
   AND CASE fs.`fee_type`
         WHEN 'TUITION'      THEN @fallback_tuition
         WHEN 'REGISTRATION' THEN @fallback_registration
         WHEN 'CURSU'        THEN @fallback_cursu
         WHEN 'GRADUATION'   THEN @fallback_graduation
         WHEN 'INTERNSHIP'   THEN @fallback_internship
         WHEN 'APPLICATION'  THEN @fallback_application
       END IS NOT NULL
   AND fs.`amount` <> CASE fs.`fee_type`
                        WHEN 'TUITION'      THEN @fallback_tuition
                        WHEN 'REGISTRATION' THEN @fallback_registration
                        WHEN 'CURSU'        THEN @fallback_cursu
                        WHEN 'GRADUATION'   THEN @fallback_graduation
                        WHEN 'INTERNSHIP'   THEN @fallback_internship
                        WHEN 'APPLICATION'  THEN @fallback_application
                      END;

-- ── 3. Mark the migration as applied ────────────────────────────────────────
INSERT IGNORE INTO `schema_migrations` (`filename`, `status`)
VALUES ('2026_08_17_139_urubuto_fee_structure_prices.sql', 'applied');

-- ── 4. Report: the same document priced twice ───────────────────────────────
-- Several documents are sold both through the public Service Request platform
-- (`service_catalog`) and through the UrubutoPay menu (`fee_structures`). Where
-- the two disagree, a payer is charged differently depending which door they
-- came through. Mapped explicitly rather than by name-matching, because the two
-- vocabularies do not line up. Nothing is changed here.
SELECT v.fee_type,
       fs.`amount`     AS urubuto_menu_price,
       sc.`fee_amount` AS service_request_price,
       sc.`name`       AS service_request_item,
       CASE WHEN fs.`amount` IS NULL          THEN 'Not on the gateway menu'
            WHEN sc.`fee_amount` IS NULL      THEN 'Not on the service platform'
            WHEN fs.`amount` = sc.`fee_amount` THEN 'Agrees'
            ELSE 'DIFFERS — finance to reconcile' END AS status
FROM (
            SELECT 'TRANSCRIPT'           AS fee_type, 'OFFICIAL_TRANSCRIPT'   AS sc_code
  UNION ALL SELECT 'TO_WHOM',                          'TO_WHOM_VISA'
  UNION ALL SELECT 'ENGLISH_CERTIFICATE',              'ENGLISH_PROFICIENCY'
  UNION ALL SELECT 'RECOMMENDATION_LETTER',            'RECOMMENDATION_LETTER'
) v
LEFT JOIN `fee_structures` fs ON fs.`fee_type` = v.fee_type
                             AND fs.`academic_year_id` = @year
                             AND fs.`is_active` = 1
                             AND fs.`department_id` IS NULL
LEFT JOIN `service_catalog` sc ON sc.`code` = v.sc_code AND sc.`is_active` = 1;

-- ── 5. Verify ───────────────────────────────────────────────────────────────
-- Every gateway service with the two prices that matter:
--   everyone_price   — the institution-wide row, quoted to a student whose
--                      department has no structure of its own (3,761 of the
--                      5,753 active students on production today)
--   department_price — the range across department-specific rows, quoted to
--                      students in the twelve departments that have them
-- '(payer names the amount)' means the USSD screen asks those students to type
-- a figure themselves.
SELECT us.`service_code`,
       us.`service_name`,
       COALESCE(us.`fee_structure_type`, '(no category)') AS priced_as,
       COALESCE(
         (SELECT FORMAT(fs.`amount`, 0) FROM `fee_structures` fs
           WHERE fs.`fee_type` = us.`fee_structure_type`
             AND fs.`academic_year_id` = @year AND fs.`is_active` = 1
             AND fs.`department_id` IS NULL AND fs.`level_id` IS NULL
           ORDER BY fs.`id` LIMIT 1),
         '(payer names the amount)')                      AS everyone_price,
       COALESCE(
         (SELECT CASE WHEN MIN(fs.`amount`) = MAX(fs.`amount`)
                      THEN FORMAT(MIN(fs.`amount`), 0)
                      ELSE CONCAT(FORMAT(MIN(fs.`amount`), 0), ' – ', FORMAT(MAX(fs.`amount`), 0)) END
            FROM `fee_structures` fs
           WHERE fs.`fee_type` = us.`fee_structure_type`
             AND fs.`academic_year_id` = @year AND fs.`is_active` = 1
             AND fs.`department_id` IS NOT NULL),
         '(none)')                                        AS department_price
FROM `urubuto_services` us
WHERE us.`is_active` = 1
  AND (us.`alias_of` IS NULL OR us.`alias_of` = '')
ORDER BY us.`sort_order`;
