-- Add payment_id link to fee_refunds so each refund is tied to a specific confirmed payment,
-- enabling server-side enforcement that refund amount ≤ original payment amount.

ALTER TABLE `fee_refunds`
  ADD COLUMN `payment_id` INT UNSIGNED NULL DEFAULT NULL AFTER `student_id`,
  ADD INDEX  `idx_fr_payment` (`payment_id`);
