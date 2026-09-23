-- ==================================================================================
-- RESET SCRIPT: Remove all HR module tables (safe cleanup)
-- Date: 2026-09-04
--
-- This script drops all HR module tables in correct dependency order
-- Run this BEFORE re-running all migrations
-- ==================================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Drop in reverse dependency order
DROP TABLE IF EXISTS `certificate_audit`;
DROP TABLE IF EXISTS `certificate_requests`;
DROP TABLE IF EXISTS `certificate_types`;
DROP TABLE IF EXISTS `contract_notifications`;
DROP TABLE IF EXISTS `employee_contracts`;
DROP TABLE IF EXISTS `contract_types`;
DROP TABLE IF EXISTS `leave_notifications`;
DROP TABLE IF EXISTS `leave_request_attachments`;
DROP TABLE IF EXISTS `leave_balances`;
DROP TABLE IF EXISTS `employee_identifiers`;
DROP TABLE IF EXISTS `employee_financial_info`;
DROP TABLE IF EXISTS `employee_qualifications`;
DROP TABLE IF EXISTS `employee_profiles`;

-- Drop views
DROP VIEW IF EXISTS `v_contract_expiry_summary`;
DROP VIEW IF EXISTS `v_leave_request_summary`;
DROP VIEW IF EXISTS `v_employee_master_list`;

-- Remove HR fields from users table (optional - keep users table)
-- ALTER TABLE `users` DROP COLUMN IF EXISTS `gender`;
-- ALTER TABLE `users` DROP COLUMN IF EXISTS `degree`;
-- ALTER TABLE `users` DROP COLUMN IF EXISTS `area_of_specialization`;
-- ALTER TABLE `users` DROP COLUMN IF EXISTS `foreign_degree_equivalence`;
-- ALTER TABLE `users` DROP COLUMN IF EXISTS `rssb_number`;
-- ALTER TABLE `users` DROP COLUMN IF EXISTS `bank_account_number`;
-- ALTER TABLE `users` DROP COLUMN IF EXISTS `bank_name`;
-- ALTER TABLE `users` DROP COLUMN IF EXISTS `phone_number`;
-- ALTER TABLE `users` DROP COLUMN IF EXISTS `employment_date`;
-- ALTER TABLE `users` DROP COLUMN IF EXISTS `supervisor_id`;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'HR Module tables dropped successfully' as status;
