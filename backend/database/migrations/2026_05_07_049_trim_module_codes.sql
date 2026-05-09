-- 2026_05_07_049_trim_module_codes.sql
-- Some legacy module codes carry leading or trailing whitespace
-- (e.g. " MTEC4322", "ACI1522 ") that breaks exact-match lookups in the
-- curriculum importer — trimmed file values fail to match padded DB
-- values and end up creating duplicate module records. Strip the padding
-- once so imports round-trip cleanly.
--
-- Idempotent: re-running the UPDATE on already-trimmed rows is a no-op.

UPDATE `modules`
SET `module_code` = TRIM(`module_code`)
WHERE `module_code` <> TRIM(`module_code`);
