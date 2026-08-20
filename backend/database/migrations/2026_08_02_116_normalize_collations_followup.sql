-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 116: Normalise every table to utf8mb4_general_ci (follow-up to 092)
--
-- CONTEXT: migration 092 (2026-07-09) converted every table on the schema to
-- utf8mb4_general_ci to close out recurring 1267 "Illegal mix of collations"
-- errors. Since then, nine migrations (090 fee_types_cur_schedule*, 094
-- system_documents, 100 payment_calendar_events, 102
-- postgraduate_international_fee_structures, 108 redesign_payment_calendar,
-- 110 service_catalog(_stages), 111 service_requests/attachments/approvals,
-- 114 service_document_types) created new tables with `COLLATE=utf8mb4_unicode_ci`
-- hardcoded in their CREATE TABLE statements, silently reintroducing the exact
-- split 092 was written to eliminate — hence the 1267 errors recurring in
-- production from 2026-07-22 onward whenever one of those tables is joined or
-- compared against an older utf8mb4_general_ci table.
--
-- FIX: re-run the same cursor-based normalize-all-tables sweep as 092, so this
-- doesn't turn into whack-a-mole against individual table names. Idempotent —
-- tables already on utf8mb4_general_ci are skipped.
--
-- IMPORTANT FOR FUTURE MIGRATIONS: this schema's standard collation is
-- utf8mb4_general_ci. New `CREATE TABLE` statements must use
-- `DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`, not utf8mb4_unicode_ci.
-- ══════════════════════════════════════════════════════════════════════════════

SET @_orig_sql_mode := @@SESSION.sql_mode;
SET SESSION sql_mode = (
  SELECT REPLACE(REPLACE(REPLACE(@@SESSION.sql_mode,
    'STRICT_TRANS_TABLES', ''), 'NO_ZERO_DATE', ''), 'NO_ZERO_IN_DATE', '')
);

DROP PROCEDURE IF EXISTS `_normalize_all_table_collations_v2`;

DELIMITER $$
CREATE PROCEDURE `_normalize_all_table_collations_v2`()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE tbl VARCHAR(64);
  DECLARE cur CURSOR FOR
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
      AND TABLE_COLLATION IS NOT NULL
      AND TABLE_COLLATION <> 'utf8mb4_general_ci';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    SET SESSION sql_mode = @_orig_sql_mode;
    RESIGNAL;
  END;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO tbl;
    IF done THEN
      LEAVE read_loop;
    END IF;

    SET @ddl := CONCAT('ALTER TABLE `', tbl, '` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci');
    PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
  END LOOP;
  CLOSE cur;
END$$
DELIMITER ;

CALL `_normalize_all_table_collations_v2`();
DROP PROCEDURE `_normalize_all_table_collations_v2`;

SET SESSION sql_mode = @_orig_sql_mode;
