-- Migration 052: Add 'reversed' to fee_payments.status enum
-- Allows UrubutoPay reversals to be tracked without conflating with 'rejected'

ALTER TABLE `fee_payments`
    MODIFY COLUMN `status`
        ENUM('pending','confirmed','rejected','reversed')
        NOT NULL DEFAULT 'pending';
