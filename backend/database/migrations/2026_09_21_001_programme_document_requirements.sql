-- ============================================================
-- 2026_09_21_001_programme_document_requirements.sql
--
-- Required student documents per programme category, editable by admins.
--
-- WHY
-- ───
-- The "required documents" checklist on the student Documents tab was a
-- hardcoded frontend list (REQUIRED_DOCS in StudentDetailsPage.tsx and
-- DocumentChecklistModal.tsx) matched against uploads by fuzzy name
-- aliases, and always assumed UNDERGRADUATE. This moves the checklist into
-- the database, keyed by `student.programme_category`, and links each
-- requirement to the existing `document_types` catalogue so an upload is
-- matched deterministically by `application_documents.document_type_id`.
--
-- Also repairs `missing_document_notes` (the audit of "please upload…"
-- notices sent to students). The 2026_09_20 versions FK'd to `students`,
-- which is a VIEW over `student` on this schema, so the CREATE failed.
--
-- All statements idempotent — safe to re-run.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- §1. programme_document_requirements
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `programme_document_requirements` (
    `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `programme_category` ENUM('undergraduate','postgraduate','masters') NOT NULL,
    `document_type_id`   INT UNSIGNED NOT NULL,
    `is_required`        TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '0 = optional; listed but never reported as missing',
    `is_active`          TINYINT(1)   NOT NULL DEFAULT 1,
    `notes`              VARCHAR(255) NULL COMMENT 'Guidance shown to the student (e.g. "Must be notarized")',
    `sort_order`         INT          NOT NULL DEFAULT 0,
    `created_by`         INT UNSIGNED NULL,
    `created_at`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_pdr_category_type` (`programme_category`, `document_type_id`),
    INDEX `idx_pdr_category` (`programme_category`, `is_active`, `sort_order`),
    CONSTRAINT `fk_pdr_document_type` FOREIGN KEY (`document_type_id`) REFERENCES `document_types`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ───────────────────────────────────────────────────────────
-- §2. missing_document_notes — audit of notices sent to students
-- (no FK to `students`: it is a view here; ids are validated in code)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `missing_document_notes` (
    `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `student_id`       INT          NOT NULL,
    `reg_number`       VARCHAR(255) NULL,
    `message`          LONGTEXT     NOT NULL,
    `document_types`   JSON         NULL COMMENT 'Array of {id, name} document types listed in the notice',
    `sent_by_user_id`  INT UNSIGNED NULL,
    `notification_id`  INT UNSIGNED NULL COMMENT 'notifications.id when an in-app notification was delivered',
    `email_to`         VARCHAR(255) NULL,
    `email_sent_at`    TIMESTAMP    NULL,
    `email_error`      VARCHAR(255) NULL,
    `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_mdn_student` (`student_id`, `created_at`),
    INDEX `idx_mdn_reg_number` (`reg_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Columns added on top of the 2026_09_20 shape, in case that CREATE did
-- succeed somewhere (a DB where `students` is a real table).
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'missing_document_notes' AND COLUMN_NAME = 'reg_number');
SET @stmt := IF(@col = 0, 'ALTER TABLE `missing_document_notes` ADD COLUMN `reg_number` VARCHAR(255) NULL AFTER `student_id`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'missing_document_notes' AND COLUMN_NAME = 'notification_id');
SET @stmt := IF(@col = 0, 'ALTER TABLE `missing_document_notes` ADD COLUMN `notification_id` INT UNSIGNED NULL AFTER `sent_by_user_id`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'missing_document_notes' AND COLUMN_NAME = 'email_to');
SET @stmt := IF(@col = 0, 'ALTER TABLE `missing_document_notes` ADD COLUMN `email_to` VARCHAR(255) NULL AFTER `notification_id`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'missing_document_notes' AND COLUMN_NAME = 'email_sent_at');
SET @stmt := IF(@col = 0, 'ALTER TABLE `missing_document_notes` ADD COLUMN `email_sent_at` TIMESTAMP NULL AFTER `email_to`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'missing_document_notes' AND COLUMN_NAME = 'email_error');
SET @stmt := IF(@col = 0, 'ALTER TABLE `missing_document_notes` ADD COLUMN `email_error` VARCHAR(255) NULL AFTER `email_sent_at`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ───────────────────────────────────────────────────────────
-- §3. Seed the document types the old hardcoded list referred to.
-- Existing catalogue rows are matched by slug and left untouched; only
-- slugs that don't exist yet are inserted (inactive-in-seed types such as
-- medical_cert / recommendation are re-activated because a requirement
-- now depends on them).
-- ───────────────────────────────────────────────────────────
INSERT INTO `document_types` (`name`, `slug`, `description`, `is_active`, `sort_order`)
SELECT * FROM (
    SELECT 'Notarized A2 Certificate or equivalent'  AS name, 'a2_certificate'      AS slug, 'Notarized copy of the A2 (secondary school) certificate or its equivalent.' AS description, 1 AS is_active, 10 AS sort_order UNION ALL
    SELECT 'A1 Certificate and Transcripts (credit transfer)', 'a1_transcripts',      'A1 certificate and transcripts — only for credit-transfer applicants.',      1, 11 UNION ALL
    SELECT 'Notarized A0 Degree',                         'a0_degree',           'Notarized copy of the bachelor''s degree (A0).',                             1, 12 UNION ALL
    SELECT 'Medical Report',                              'medical_report',      'Recent medical report from a recognised health facility.',                   1, 13 UNION ALL
    SELECT 'Application Letter',                          'application_letter',  'Signed letter of application addressed to the university.',                  1, 14 UNION ALL
    SELECT 'Criminal Record',                             'criminal_record',     'Criminal record extract (police clearance).',                                1, 15 UNION ALL
    SELECT 'Health Insurance',                            'health_insurance',    'Proof of valid health insurance cover.',                                     1, 16 UNION ALL
    SELECT 'Recommendation Letter',                       'recommendation',      'Recommendation letter from an employer or academician.',                     1, 17
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM `document_types` dt WHERE dt.slug = seed.slug);

UPDATE `document_types` SET `is_active` = 1 WHERE `slug` IN ('id_card', 'recommendation');

-- ───────────────────────────────────────────────────────────
-- §4. Seed the default checklist per programme category
--     (UNDERGRADUATE → undergraduate, MASTERS → masters, PGDE → postgraduate)
--     Only when the category has no rows yet, so admin edits survive re-runs.
-- ───────────────────────────────────────────────────────────
INSERT INTO `programme_document_requirements` (`programme_category`, `document_type_id`, `is_required`, `sort_order`)
SELECT seed.cat, dt.id, seed.req, seed.ord
FROM (
    SELECT 'undergraduate' AS cat, 'a2_certificate'     AS slug, 1 AS req, 1 AS ord UNION ALL
    SELECT 'undergraduate', 'a1_transcripts',     0, 2 UNION ALL
    SELECT 'undergraduate', 'medical_report',     1, 3 UNION ALL
    SELECT 'undergraduate', 'id_card',            1, 4 UNION ALL
    SELECT 'undergraduate', 'application_letter', 1, 5 UNION ALL
    SELECT 'undergraduate', 'criminal_record',    1, 6 UNION ALL
    SELECT 'undergraduate', 'health_insurance',   1, 7 UNION ALL

    SELECT 'masters', 'a2_certificate',     1, 1 UNION ALL
    SELECT 'masters', 'a0_degree',          1, 2 UNION ALL
    SELECT 'masters', 'medical_report',     1, 3 UNION ALL
    SELECT 'masters', 'id_card',            1, 4 UNION ALL
    SELECT 'masters', 'application_letter', 1, 5 UNION ALL
    SELECT 'masters', 'criminal_record',    1, 6 UNION ALL
    SELECT 'masters', 'health_insurance',   1, 7 UNION ALL
    SELECT 'masters', 'recommendation',     1, 8 UNION ALL

    SELECT 'postgraduate', 'a2_certificate',     1, 1 UNION ALL
    SELECT 'postgraduate', 'a0_degree',          1, 2 UNION ALL
    SELECT 'postgraduate', 'medical_report',     1, 3 UNION ALL
    SELECT 'postgraduate', 'id_card',            1, 4 UNION ALL
    SELECT 'postgraduate', 'application_letter', 1, 5 UNION ALL
    SELECT 'postgraduate', 'criminal_record',    1, 6 UNION ALL
    SELECT 'postgraduate', 'health_insurance',   1, 7
) AS seed
JOIN `document_types` dt ON dt.slug = seed.slug
WHERE NOT EXISTS (
    SELECT 1 FROM `programme_document_requirements` r WHERE r.programme_category = seed.cat
);
