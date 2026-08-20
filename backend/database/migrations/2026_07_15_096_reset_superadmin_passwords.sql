-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 096: Reset superadmin passwords for fresh login
--
-- After merging the fee structures export feature and fixing the permission system,
-- superadmin accounts needed password reset to support fresh login flow.
--
-- This migration resets the primary superadmin account password to a known value.
-- ══════════════════════════════════════════════════════════════════════════════

-- Reset password for faustinganzasheila@gmail.com to: admin123456
-- Hash: $2y$10$TAnIgxtPFsUKeQjWRIoJqODEW45xk1pqYEV3bh3QWSpftgTReuinu
UPDATE `users`
SET `password` = '$2y$10$TAnIgxtPFsUKeQjWRIoJqODEW45xk1pqYEV3bh3QWSpftgTReuinu',
    `updated_at` = NOW()
WHERE `email` = 'faustinganzasheila@gmail.com';
