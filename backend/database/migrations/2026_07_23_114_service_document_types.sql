-- Migration 114: Link service_catalog to real document generators.
--
-- Until now service_catalog.document_template_type was a free-text VARCHAR
-- that nothing ever read — ServiceRequestDocumentPdf always rendered the
-- same generic confirmation letter regardless of which service was
-- requested. This migration introduces a `service_document_types` lookup
-- table matching the identifiers DocumentController::ALLOWED_TYPES already
-- uses (backend/app/Controllers/DocumentController.php), links
-- service_catalog to it via a real FK, backfills the existing seeded
-- services, and — per the "each document should have a service" requirement
-- — creates a purchasable service_catalog row for every document type that
-- didn't already have one.
--
-- Named `service_document_types` (NOT `document_types`) because a table
-- called `document_types` already exists in this schema — it's the
-- unrelated admission-application document CHECKLIST catalogue (National
-- ID, transcript upload, etc. — see 2026_04_22_009_create_admission_tables.sql),
-- with a completely different shape (slug/allowed_extensions/sort_order).
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS `service_document_types` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `key`         VARCHAR(100) NOT NULL COMMENT 'Matches DocumentController::ALLOWED_TYPES identifiers',
  `name`        VARCHAR(150) NOT NULL,
  `description` VARCHAR(500) NULL DEFAULT NULL,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_service_document_types_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `service_document_types` (`key`, `name`, `description`)
SELECT * FROM (
  SELECT 'generic_service_letter' AS `key`, 'Generic Service Letter' AS `name`, 'Generic confirmation letter used when no specific document generator applies.' AS `description`
  UNION ALL SELECT 'to_whom_visa',          'To Whom For Visa',                 'Official letter to the Director General of Immigration authorizing the student''s stay in Rwanda.'
  UNION ALL SELECT 'admission_letter',      'Admission Letter',                 'Formal admission confirmation from the Office of the Academic Registrar.'
  UNION ALL SELECT 'registration_form',     'Student Registration Form',        'Official enrolment record showing student identification, category, contacts, and prior institution.'
  UNION ALL SELECT 'english_proficiency',   'English Proficiency Certificate',  'Certificate confirming that the medium of instruction at CUR is English.'
  UNION ALL SELECT 'completed_modules',     'Completed Modules Report',         'Official report of all completed modules with recorded marks, total credits, and level breakdown.'
  UNION ALL SELECT 'degree_bachelor',       'Bachelor''s Degree Certificate',   'Official Bachelor''s Degree certificate.'
  UNION ALL SELECT 'degree_pgde',           'Postgraduate Diploma Certificate', 'Official Postgraduate Diploma certificate.'
  UNION ALL SELECT 'degree_undergraduate',  'Undergraduate Degree Certificate', 'Official Undergraduate Degree certificate.'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM `service_document_types` dt WHERE dt.`key` = seed.`key`);

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'service_catalog'
    AND COLUMN_NAME = 'document_type_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `service_catalog` ADD COLUMN `document_type_id` INT UNSIGNED NULL DEFAULT NULL AFTER `document_template_type`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'service_catalog'
    AND CONSTRAINT_NAME = 'fk_service_catalog_document_type'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE `service_catalog` ADD CONSTRAINT `fk_service_catalog_document_type` FOREIGN KEY (`document_type_id`) REFERENCES `service_document_types` (`id`) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill the existing seeded services with their real best-fit generator.
UPDATE `service_catalog` sc
  JOIN `service_document_types` dt ON dt.`key` = 'completed_modules'
  SET sc.`document_type_id` = dt.`id`
WHERE sc.`slug` = 'official-transcript' AND sc.`document_type_id` IS NULL;

UPDATE `service_catalog` sc
  JOIN `service_document_types` dt ON dt.`key` = 'registration_form'
  SET sc.`document_type_id` = dt.`id`
WHERE sc.`slug` = 'proof-of-enrollment' AND sc.`document_type_id` IS NULL;

-- Everything else (e.g. Recommendation Letter, which has no dedicated
-- student-record generator) keeps the generic letter.
UPDATE `service_catalog` sc
  JOIN `service_document_types` dt ON dt.`key` = 'generic_service_letter'
  SET sc.`document_type_id` = dt.`id`
WHERE sc.`document_type_id` IS NULL;

-- Ensure every document type has a linked, purchasable service — create one
-- for any type that doesn't have one yet (admins can adjust fee/description
-- via the Service Catalog admin page afterwards).
INSERT INTO `service_catalog`
  (`code`, `name`, `slug`, `category`, `short_description`, `full_description`,
   `requirements`, `required_attachments`, `document_type_id`,
   `fee_amount`, `fee_currency`, `requires_payment`, `processing_sla_days`, `is_active`)
SELECT
  UPPER(dt.`key`), dt.`name`, REPLACE(dt.`key`, '_', '-'), seed_meta.`category`, dt.`description`, dt.`description`,
  JSON_ARRAY('Must be a currently registered or graduated student'),
  JSON_ARRAY(JSON_OBJECT('key','national_id','label','Copy of National ID or Passport','mime_types',JSON_ARRAY('pdf','jpg','jpeg','png'),'max_size_kb',5120,'required',TRUE)),
  dt.`id`,
  seed_meta.`fee_amount`, 'RWF', 1, 5, 1
FROM `service_document_types` dt
JOIN (
  SELECT 'to_whom_visa' AS `key`, 'Visa & Travel' AS `category`, 5000 AS `fee_amount`
  UNION ALL SELECT 'admission_letter',     'Academic Records', 3000
  UNION ALL SELECT 'english_proficiency',  'Certificates',     3000
  UNION ALL SELECT 'degree_bachelor',      'Certificates',     10000
  UNION ALL SELECT 'degree_pgde',          'Certificates',     10000
  UNION ALL SELECT 'degree_undergraduate', 'Certificates',     10000
) AS seed_meta ON seed_meta.`key` = dt.`key`
WHERE NOT EXISTS (SELECT 1 FROM `service_catalog` sc WHERE sc.`document_type_id` = dt.`id`);

-- One final-approval stage for every newly-created service above.
INSERT INTO `service_catalog_stages`
  (`service_id`, `stage_order`, `stage_key`, `stage_label`, `required_permission_slug`, `stage_type`, `is_final_approval`)
SELECT sc.`id`, 1, 'final_review', 'Registrar Review', 'APPROVE_SERVICE_REQUEST_FINAL', 'approval', 1
FROM `service_catalog` sc
WHERE sc.`document_type_id` IN (
  SELECT id FROM `service_document_types` WHERE `key` IN (
    'to_whom_visa','admission_letter','english_proficiency',
    'degree_bachelor','degree_pgde','degree_undergraduate'
  )
)
AND NOT EXISTS (SELECT 1 FROM `service_catalog_stages` scs WHERE scs.`service_id` = sc.`id`);
