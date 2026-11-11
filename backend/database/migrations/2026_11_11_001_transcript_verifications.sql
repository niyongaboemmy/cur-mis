-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 2026-11-11 001: verification codes for issued transcripts.
--
-- Every transcript PDF the system issues is recorded here with a random code.
-- Each sheet carries a QR code holding the code, which opens the
-- public page /verify/transcript?code=…, which shows what was issued so a
-- verifier can compare it with the paper.
--
--   code          16 characters shown as XXXX-XXXX-XXXX-XXXX (≈ 80 bits, not guessable)
--   content_hash  sha256 of the printed content (identity block + every sheet);
--                 the same content issued again on the same day reuses the code,
--                 and a newer row with a different hash means the results changed
--   snapshot      JSON of the printed content, shown on the verification page
--   issued_on     the date printed on the sheets ("Issued at TABA dd-mm-yy")
--
-- The existing `transcripts` table is not used: it belongs to the separate
-- transcript-drafts app, has no primary key, and uses its own code format.
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `transcript_verifications` (
  `id`           int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`         varchar(24)  NOT NULL,
  `regnumber`    varchar(64)  NOT NULL,
  `content_hash` char(64)     NOT NULL,
  `snapshot`     mediumtext   NOT NULL,
  `issued_on`    date         NOT NULL,
  `issued_by`    int(10) UNSIGNED DEFAULT NULL,
  `issued_at`    timestamp    NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_tv_code` (`code`),
  KEY `idx_tv_reg` (`regnumber`, `issued_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
