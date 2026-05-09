-- 2026_05_07_044_relax_faculty_dep_required_columns.sql
-- The original `faculty` and `departements` schemas declare several
-- text/relation columns as NOT NULL with no DEFAULT — fine when every
-- INSERT goes through the manual UI form (which always submits empty
-- strings for text fields), but it breaks bulk Excel imports that only
-- carry the human-supplied subset of columns. We relax these to NULL so
-- imports can omit them; admins fill them in via inline edit afterward.
--
-- Idempotent — `MODIFY COLUMN` with the same definition is a no-op.

ALTER TABLE `faculty`
  MODIFY `fac_descript` TEXT       NULL,
  MODIFY `fac_reg_date` DATE       NULL,
  MODIFY `school_id`    INT(11)    NULL,
  MODIFY `fac_code`     VARCHAR(50) NULL;

ALTER TABLE `departements`
  MODIFY `dep_acronym`     VARCHAR(50) NULL,
  MODIFY `dep_description` TEXT       NULL,
  MODIFY `dep_author`      INT(11)    NULL,
  MODIFY `program`         VARCHAR(100) NULL,
  MODIFY `school_id`       INT(11)    NULL,
  MODIFY `fac_id`          INT(11)    NULL;
