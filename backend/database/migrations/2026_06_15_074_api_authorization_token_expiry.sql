-- ============================================================
-- Migration: 074 — Add token_expires_at to api_authorization
-- Date: 2026-06-15
--
-- Tokens issued by the UrubutoPay auth endpoint now expire
-- after 2 hours. The middleware rejects any token whose
-- token_expires_at is in the past.
-- ============================================================

ALTER TABLE api_authorization
    ADD COLUMN token_expires_at DATETIME NULL DEFAULT NULL
        COMMENT '2-hour expiry set on each /auth/authenticate call; NULL = never issued via API';
