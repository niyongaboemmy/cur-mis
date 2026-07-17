-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Migration 098: Add student_category and currency dimensions to fee_structures
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Phase 1 (Academic Fees Structure completion) of the MIS revision request: the client asked for
-- fee structures to be filterable/resolvable by student category (local/international,
-- sponsored/self-sponsored) and to carry an explicit currency instead of assuming RWF everywhere.
--
-- Note: `student.category` (see 2026_04_27_027_comprehensive_schema.sql) already exists but stores
-- the academic-level bucket ("undergraduate"/"postgraduate" — see StudentController::categoryVariants),
-- not residency/sponsorship. It does not cover this dimension, so `fee_structures.student_category`
-- is a new, independent lookup rather than a reuse of that column.
--
-- Both columns are nullable/defaulted so existing rows remain valid: NULL student_category means
-- "applies to all categories" (mirrors how findBestMatch already treats NULL department_id/level_id).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE `fee_structures`
  ADD COLUMN IF NOT EXISTS `student_category` ENUM('local','international','sponsored','self_sponsored') NULL DEFAULT NULL AFTER `level_id`;

ALTER TABLE `fee_structures`
  ADD COLUMN IF NOT EXISTS `currency` VARCHAR(10) NOT NULL DEFAULT 'RWF' AFTER `amount`;

SET FOREIGN_KEY_CHECKS = 1;
