-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 153: let the registry decide, per programme, which modules a
-- transcript prints.
-- Date: 2026-08-29
--
-- WHY
-- ───
-- A transcript prints the intersection of a student's marks with their
-- option's curriculum (`module_programs`). That is right where the curriculum
-- is complete — verified against a signed transcript, it reproduced the
-- printed module list exactly — but the curriculum is NOT complete
-- everywhere: 613 modules across all programmes have real cohort marks
-- (real distributions, not bulk stamps) while missing from their option's
-- module list. Every one of those can silently drop a genuine course from a
-- signed document, which is exactly what happened to ENPR 3311.
--
-- Widening the filter is not the answer either — it would print the
-- class-wide bulk entries the filter exists to remove. Neither the curriculum
-- table nor any heuristic can tell a real course from a bulk stamp with
-- certainty, so the decision belongs to the registry, recorded and auditable.
--
-- WHAT THIS IS
-- ────────────
-- One row per (option, module) that a human has ruled on. It OVERRIDES the
-- curriculum test in both directions:
--   visible = 1  → always print it, even though the curriculum omits it
--   visible = 0  → never print it, even though the curriculum includes it
-- A module with no row here keeps today's behaviour (curriculum decides), so
-- this migration changes no existing transcript on its own.
--
-- `module_ident` is the module code normalised (UPPER, spaces stripped)
-- rather than a module_id: the catalogue holds the same module several times
-- under variant spellings ("ADPR 2322" / "ADPR2322"), and a decision must
-- cover all of them at once — the same identity the transcript already
-- de-duplicates on.
--
-- Idempotent — safe to re-run. Portable MySQL 8 / MariaDB.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `transcript_module_visibility` (
  `id`           INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `option_id`    INT(11)      NOT NULL COMMENT 'options.id — the programme this ruling applies to',
  `module_ident` VARCHAR(80)  NOT NULL COMMENT 'UPPER(module_code) with spaces stripped',
  `visible`      TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1 = always print, 0 = never print',
  `note`         VARCHAR(255) DEFAULT NULL COMMENT 'Why — shown to whoever reviews it next',
  `decided_by`   INT(10) UNSIGNED DEFAULT NULL COMMENT 'users.id',
  `decided_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tmv_option_module` (`option_id`, `module_ident`),
  KEY `idx_tmv_option` (`option_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Registry rulings on which modules a programme''s transcript prints';
