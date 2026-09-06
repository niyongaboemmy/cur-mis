-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 152: text hygiene — repair double-encoded module names, trim
-- whitespace-padded student names.
-- Date: 2026-08-29
--
-- 1. Nineteen catalogue module names (the Kinyarwanda titles and one en-dash
--    English title) were stored double-encoded: the bytes hold the UTF-8
--    encoding of "â€™" (C3A2 E282AC E284A2) where a real apostrophe (E28099)
--    belongs. They print as "rwâ€™Ikinyarwanda" on transcripts. The classic
--    repair round-trips through latin1: interpret the mangled characters as
--    the cp1252 bytes they encode, then read those bytes as UTF-8. Guarded by
--    the byte signature, so it only touches mangled rows and is a no-op once
--    repaired.
--
-- 2. 279 students carry leading/trailing whitespace in fname/lname (e.g.
--    "DUSHIMIMANA " / "Michel ") — invisible in the UI but printed on
--    documents and fed into exports.
--
-- Idempotent — safe to re-run. Portable MySQL 8 / MariaDB.
-- ══════════════════════════════════════════════════════════════════════════════

-- Match the FULL "â€™" mojibake signature (C3A2 E282AC E284A2), not just its
-- C3A2E282AC prefix. The looser prefix also caught a differently-corrupted row
-- ("...à l'enseignement du français"), whose latin1 round-trip yields invalid
-- utf8mb4 and aborted the whole migration in production. The full signature
-- only matches the rows this repair is actually for.
UPDATE `modules`
   SET `module_name` = CONVERT(BINARY CONVERT(`module_name` USING latin1) USING utf8mb4)
 WHERE HEX(CONVERT(`module_name` USING binary)) LIKE '%C3A2E282ACE284A2%';

UPDATE `student`
   SET `fname` = TRIM(`fname`),
       `lname` = TRIM(`lname`)
 WHERE `fname` <> TRIM(`fname`) OR `lname` <> TRIM(`lname`);
