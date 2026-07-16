-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Migration 102: Postgraduate Fees — International Students (Phase 5)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md §2.4 / §3 Phase 5, MIS_Fix_Request.pdf §4.
--
-- Deliberately a SEPARATE table from `fee_structures` per the client's explicit instruction not
-- to merge postgraduate/international fees into the regular fee schedule. Mirrors fee_structures'
-- core columns (see 2026_04_25_022_create_fee_management_tables.sql + 098/091/092 alterations)
-- plus nationality_region, surcharge_type, and currency for this fee type's own dimensions.
--
-- Depends on Phase 1 (098_fee_structures_add_category_currency.sql) being finalized so both tables
-- share the same currency-column convention (VARCHAR(10), default RWF for local-facing tables;
-- this table defaults to USD since it targets international students — see currency note below).
--
-- Currency handling assumption (flagged per plan §4 open question 4, pending Finance confirmation):
-- FIXED quoted rates per academic year — store amount + currency code and display as-is, no live
-- FX conversion/rate table. Simpler option chosen as the default per the task instructions; revisit
-- if Finance confirms live FX conversion is actually required.
--
-- NULL semantics mirror fee_structures/findBestMatch: NULL department_id/level_id/nationality_region
-- means "applies to all" for that dimension.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `postgraduate_international_fee_structures` (
  `id`                 INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `academic_year_id`   INT UNSIGNED     NOT NULL,
  `department_id`      INT              NULL DEFAULT NULL COMMENT 'departements.program_level = postgraduate; NULL = all postgraduate departments; type matches departements.dep_id (signed)',
  `level_id`           INT              NULL DEFAULT NULL COMMENT 'Type matches levels.id (signed)',
  `fee_type`           VARCHAR(50)      NOT NULL COMMENT 'References fee_types.code, same convention as fee_structures.fee_type',
  `label`              VARCHAR(120)     NOT NULL,
  `amount`             DECIMAL(12,2)    NOT NULL,
  `currency`           VARCHAR(10)      NOT NULL DEFAULT 'USD',
  `semester`           TINYINT UNSIGNED NULL DEFAULT NULL,
  `payment_plan`       ENUM('full_year','per_semester','per_installment') NOT NULL DEFAULT 'full_year',
  `installment_count`  INT UNSIGNED     NULL DEFAULT NULL,
  `nationality_region` VARCHAR(100)     NULL DEFAULT NULL COMMENT 'NULL = applies to all nationalities/regions',
  `surcharge_type`     ENUM('visa','insurance','other','none') NOT NULL DEFAULT 'none',
  `is_active`          TINYINT(1)       NOT NULL DEFAULT 1,
  `created_by`         INT UNSIGNED     NULL DEFAULT NULL,
  `created_at`         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pgifs_year_dept_level` (`academic_year_id`, `department_id`, `level_id`),
  KEY `idx_pgifs_fee_type` (`fee_type`),
  KEY `idx_pgifs_is_active` (`is_active`),
  CONSTRAINT `fk_pgifs_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`),
  CONSTRAINT `fk_pgifs_department`    FOREIGN KEY (`department_id`)    REFERENCES `departements` (`dep_id`),
  CONSTRAINT `fk_pgifs_level`         FOREIGN KEY (`level_id`)         REFERENCES `levels` (`id`),
  CONSTRAINT `fk_pgifs_created_by`    FOREIGN KEY (`created_by`)       REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
