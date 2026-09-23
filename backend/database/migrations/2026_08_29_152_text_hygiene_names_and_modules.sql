-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 152: text hygiene — repair double-encoded module names, trim
-- whitespace-padded student names.
-- Date: 2026-08-29
--
-- 1. Catalogue module names were stored double-encoded: the bytes hold the
--    UTF-8 encoding of "â€™" (C3A2 E282AC E284A2) where a real apostrophe
--    (E28099) belongs. They print as "rwâ€™Ikinyarwanda" on transcripts. The
--    repair round-trips through latin1: read the mangled characters as the
--    cp1252 bytes they encode, then read those bytes as UTF-8.
--
--    Done row by row inside a procedure with a CONTINUE HANDLER for error 1300
--    ("Invalid utf8mb4 character string"): a handful of rows carry mixed
--    corruption where the latin1 round-trip yields invalid utf8mb4 (production
--    hit "...à l'enseignement du français"). A blanket UPDATE aborts the whole
--    migration on the first such row; the loop skips it and repairs the rest.
--    The handler is scoped to 1300 only so it can never swallow the cursor's
--    NOT FOUND and spin.
--
-- 2. Students carry leading/trailing whitespace in fname/lname — invisible in
--    the UI but printed on documents and fed into exports.
--
-- Idempotent — safe to re-run. MigrationService::splitStatements() is
-- DELIMITER-aware.
-- ══════════════════════════════════════════════════════════════════════════════

DROP PROCEDURE IF EXISTS `_mig152_fix_module_names`;
DELIMITER $$
CREATE PROCEDURE `_mig152_fix_module_names`()
BEGIN
  DECLARE v_done INT DEFAULT 0;
  DECLARE v_id   INT;
  DECLARE cur CURSOR FOR
    SELECT `module_id` FROM `modules`
     WHERE HEX(CONVERT(`module_name` USING binary)) LIKE '%C3A2E282AC%';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
  DECLARE CONTINUE HANDLER FOR 1300 BEGIN END;   -- skip rows that don't round-trip
  OPEN cur;
  fix_loop: LOOP
    FETCH cur INTO v_id;
    IF v_done = 1 THEN
      LEAVE fix_loop;
    END IF;
    UPDATE `modules`
       SET `module_name` = CONVERT(BINARY CONVERT(`module_name` USING latin1) USING utf8mb4)
     WHERE `module_id` = v_id;
  END LOOP;
  CLOSE cur;
END$$
DELIMITER ;
CALL `_mig152_fix_module_names`();
DROP PROCEDURE `_mig152_fix_module_names`;

UPDATE `student`
   SET `fname` = TRIM(`fname`),
       `lname` = TRIM(`lname`)
 WHERE `fname` <> TRIM(`fname`) OR `lname` <> TRIM(`lname`);
