-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 138: give every UrubutoPay service a real fee category, so a
-- payment can be listed under WHAT it paid for.
-- Date: 2026-08-17
--
-- WHY
-- ───
-- Migration 134 registered the 22 gateway services and mapped each to the
-- internal fee_type it settles. Eleven of them had no `fee_structure_type`,
-- because no matching row existed in `fee_types`: Technology fees, Retake,
-- Re-integration, Final project, the four CPA services, Covered module report,
-- Recommendation letter and Other fees. A service with no fee category cannot
-- be priced through Finance → Fee Structures (the fee-type dropdown is fed from
-- `fee_types`), and it shows up in the payments listing with nothing to name it
-- beyond the raw gateway code.
--
-- This migration closes that: one fee type per gateway service, the gateway
-- catalogue pointed at it, and the fee-type vocabulary reconciled with what
-- `fee_structures` actually contains.
--
-- WHAT IT DOES NOT DO
-- ───────────────────
-- It creates no `fee_structures` rows. A structure carries a PRICE, and the
-- gateway's registered amount is a 5 RWF placeholder, not the institution's
-- fee. Finance publishes the real amounts through Finance → Fee Structures,
-- which — after this migration — offers every one of these categories in the
-- dropdown. Inventing amounts here would bill students against numbers nobody
-- approved.
--
-- It also does not re-attribute historic payments. Every gateway payment made
-- before migration 137 was recorded as `tuition-fees-4679` regardless of what
-- the payer chose (the callback handler defaulted to it), and the real
-- selection was never received. That information is gone; guessing it would
-- put fabricated categories into the ledger.
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Fee categories for the gateway services that had none ────────────────
-- `code` is the value stored in fee_structures.fee_type / fee_invoices.fee_type
-- and is immutable; `label` is what Finance and the payments listing display.
-- Existing codes are left completely alone — an administrator may have renamed
-- a label, and this must not overwrite that.
INSERT IGNORE INTO `fee_types` (`code`, `label`, `description`, `is_active`, `sort_order`) VALUES
  ('TECHNOLOGY',           'Technology Fee',          'ICT / technology levy — UrubutoPay service technology-fees-9754',      1, 21),
  ('RETAKE',               'Retake Fee',              'Module retake — UrubutoPay service retake-5953',                        1, 22),
  ('CPA_REGISTRATION',     'CPA Registration Fee',    'CPA programme registration — UrubutoPay service cpa-registration-fee-2199', 1, 23),
  ('CPA_FOUNDATION1',      'CPA Foundation 1',        'CPA Foundation level 1 — UrubutoPay service cpa-foundation1-6821',      1, 24),
  ('CPA_FOUNDATION2',      'CPA Foundation 2',        'CPA Foundation level 2 — UrubutoPay service cpa-foundation2-7872',      1, 25),
  ('CPA_ADVANCED',         'CPA Advanced',            'CPA Advanced level — UrubutoPay service cpa-advanced-8607',             1, 26),
  ('COVERED_MODULE_REPORT','Covered Module Report',   'Covered module report — UrubutoPay service covered-module-report-8800', 1, 27),
  ('RECOMMENDATION_LETTER','Recommendation Letter',   'Recommendation letter — UrubutoPay service recommendation-letter-6660', 1, 28),
  ('OTHER',                'Other Fees',              'Catch-all for payments the payer could not categorise — UrubutoPay service other-fees-8272', 1, 29);

-- The two internship services share one category; make sure it is there under
-- the code migration 134 already points at, and likewise the rest of the
-- vocabulary those 22 services rely on. INSERT IGNORE, so a row that exists
-- (with whatever label Finance gave it) is untouched.
INSERT IGNORE INTO `fee_types` (`code`, `label`, `is_active`, `sort_order`) VALUES
  ('INTERNSHIP',          'Internship Fee',           1, 12),
  ('FINAL_PROJECT',       'Final Project Fee',        1, 13),
  ('GRADUATION',          'Graduation Fee',           1, 14),
  ('TRANSCRIPT',          'Transcript Fee',           1, 15),
  ('ENGLISH_CERTIFICATE', 'English Certificate Fee',  1, 16),
  ('REINTEGRATION',       'Reintegration Fee',        1, 17),
  ('TO_WHOM',             'To Whom It May Concern',   1, 19),
  ('APPLICATION',         'Application Fee',          1, 20),
  ('CURSU',               'CURSU Fee',                1, 11);

-- ── 2. Adopt fee types already in use by published structures ───────────────
-- Live `fee_structures` rows carry fee_type values that were typed straight
-- into the old free-text field and never registered ('Amakayi', 'Imyambaro',
-- 'Manuma' …). They price real fees, so they are adopted rather than ignored:
-- without a `fee_types` row the structure cannot be edited through the UI
-- (its own fee type is missing from the dropdown) and the payments listing has
-- no label for it.
INSERT IGNORE INTO `fee_types` (`code`, `label`, `description`, `is_active`, `sort_order`)
SELECT DISTINCT fs.`fee_type`,
       fs.`fee_type`,
       'Adopted at migration 138 from an existing published fee structure',
       1,
       900
FROM `fee_structures` fs
LEFT JOIN `fee_types` ft ON ft.`code` = fs.`fee_type`
WHERE ft.`id` IS NULL
  AND TRIM(fs.`fee_type`) <> '';

-- Same for fee types that only ever appear on invoices.
INSERT IGNORE INTO `fee_types` (`code`, `label`, `description`, `is_active`, `sort_order`)
SELECT DISTINCT fi.`fee_type`,
       fi.`fee_type`,
       'Adopted at migration 138 from an existing invoice',
       1,
       910
FROM `fee_invoices` fi
LEFT JOIN `fee_types` ft ON ft.`code` = fi.`fee_type`
WHERE ft.`id` IS NULL
  AND TRIM(fi.`fee_type`) <> '';

-- ── 3. Point each gateway service at its pricing category ───────────────────
-- `fee_structure_type` is the fee_types.code that PRICES the service. Only the
-- rows migration 134 left NULL are filled; a mapping finance has since chosen
-- is never overwritten.
UPDATE `urubuto_services` SET `fee_structure_type` = 'TECHNOLOGY'            WHERE `service_code` = 'technology-fees-9754'       AND `fee_structure_type` IS NULL;
UPDATE `urubuto_services` SET `fee_structure_type` = 'FINE'                  WHERE `service_code` = 'fines-1062'                 AND `fee_structure_type` IS NULL;
UPDATE `urubuto_services` SET `fee_structure_type` = 'RETAKE'                WHERE `service_code` = 'retake-5953'                AND `fee_structure_type` IS NULL;
UPDATE `urubuto_services` SET `fee_structure_type` = 'REINTEGRATION'         WHERE `service_code` = 'reintegration-fees-2417'    AND `fee_structure_type` IS NULL;
UPDATE `urubuto_services` SET `fee_structure_type` = 'FINAL_PROJECT'         WHERE `service_code` = 'final-project-fees-9014'    AND `fee_structure_type` IS NULL;
UPDATE `urubuto_services` SET `fee_structure_type` = 'CPA_FOUNDATION1'       WHERE `service_code` = 'cpa-foundation1-6821'       AND `fee_structure_type` IS NULL;
UPDATE `urubuto_services` SET `fee_structure_type` = 'CPA_FOUNDATION2'       WHERE `service_code` = 'cpa-foundation2-7872'       AND `fee_structure_type` IS NULL;
UPDATE `urubuto_services` SET `fee_structure_type` = 'CPA_ADVANCED'          WHERE `service_code` = 'cpa-advanced-8607'          AND `fee_structure_type` IS NULL;
UPDATE `urubuto_services` SET `fee_structure_type` = 'CPA_REGISTRATION'      WHERE `service_code` = 'cpa-registration-fee-2199'  AND `fee_structure_type` IS NULL;
UPDATE `urubuto_services` SET `fee_structure_type` = 'COVERED_MODULE_REPORT' WHERE `service_code` = 'covered-module-report-8800' AND `fee_structure_type` IS NULL;
UPDATE `urubuto_services` SET `fee_structure_type` = 'RECOMMENDATION_LETTER' WHERE `service_code` = 'recommendation-letter-6660' AND `fee_structure_type` IS NULL;
UPDATE `urubuto_services` SET `fee_structure_type` = 'OTHER'                 WHERE `service_code` = 'other-fees-8272'            AND `fee_structure_type` IS NULL;

-- `fee_type` — the BILLING category, which decides which invoice a payment
-- settles first — is deliberately NOT changed for services that already have
-- one. Retyping 'technology-fees' from REGISTRATION to TECHNOLOGY would stop
-- it settling the REGISTRATION invoices students are actually billed on today,
-- and send the money down the FIFO waterfall instead. Finance can retype a
-- service from Settings once it bills that category separately.
--
-- `other-fees` stays NULL on purpose: it means "no specific category", which is
-- what sends it down the plain FIFO waterfall. Its OTHER fee type exists for
-- PRICING and for the payments listing label only.

-- ── 4. Keep the two vocabularies honest ─────────────────────────────────────
-- Every fee_structure_type a service points at must exist in `fee_types`,
-- otherwise the Fee Structures screen cannot offer it. Anything still dangling
-- after §1–§3 is registered here rather than left broken.
INSERT IGNORE INTO `fee_types` (`code`, `label`, `description`, `is_active`, `sort_order`)
SELECT DISTINCT us.`fee_structure_type`,
       us.`service_name`,
       CONCAT('Auto-registered at migration 138 for UrubutoPay service ', us.`service_code`),
       1,
       920
FROM `urubuto_services` us
LEFT JOIN `fee_types` ft ON ft.`code` = us.`fee_structure_type`
WHERE us.`fee_structure_type` IS NOT NULL
  AND TRIM(us.`fee_structure_type`) <> ''
  AND ft.`id` IS NULL;

-- Same guarantee for the billing vocabulary.
INSERT IGNORE INTO `fee_types` (`code`, `label`, `description`, `is_active`, `sort_order`)
SELECT DISTINCT us.`fee_type`,
       us.`fee_type`,
       'Auto-registered at migration 138 — billing category used by a gateway service',
       1,
       930
FROM `urubuto_services` us
LEFT JOIN `fee_types` ft ON ft.`code` = us.`fee_type`
WHERE us.`fee_type` IS NOT NULL
  AND TRIM(us.`fee_type`) <> ''
  AND ft.`id` IS NULL;

-- ── 5. Verify ───────────────────────────────────────────────────────────────
-- One row per gateway service: the category it bills, the category it is
-- priced under, and whether a price has actually been published. A service
-- reading 'no published price' is payable at an amount the payer types in —
-- which is fine for fines, and probably wrong for a graduation fee.
SELECT us.`service_code`,
       us.`service_name`,
       COALESCE(us.`fee_type`, '(FIFO — no specific category)')      AS bills_as,
       COALESCE(us.`fee_structure_type`, '(not priced centrally)')   AS priced_as,
       COALESCE(ft.`label`, '(fee type missing!)')                   AS fee_type_label,
       COALESCE((SELECT COUNT(*) FROM `fee_structures` fs
                  WHERE fs.`fee_type` = us.`fee_structure_type`
                    AND fs.`is_active` = 1), 0)                      AS published_prices
FROM `urubuto_services` us
LEFT JOIN `fee_types` ft ON ft.`code` = us.`fee_structure_type`
WHERE us.`is_active` = 1
  AND (us.`alias_of` IS NULL OR us.`alias_of` = '')
ORDER BY us.`sort_order`;
