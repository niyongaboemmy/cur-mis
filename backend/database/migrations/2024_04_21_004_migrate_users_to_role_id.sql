-- 1. Insert existing unique roles from `users` table into the new `roles` table.
-- Using INSERT IGNORE to prevent duplicates if the migration is re-run.
INSERT IGNORE INTO `roles` (`name`, `description`)
SELECT DISTINCT `role`, CONCAT(UCASE(MID(`role`, 1, 1)), MID(`role`, 2), ' Role')
FROM `users` 
WHERE `role` IS NOT NULL AND `role` != '';

-- Add a default role just in case there were no users
INSERT IGNORE INTO `roles` (`name`, `description`) VALUES ('guest', 'Guest Role');

-- 2. Add `role_id` column to `users` table
ALTER TABLE `users` 
ADD COLUMN `role_id` INT NULL AFTER `role`;

-- 3. Update `users.role_id` based on `users.role` mapping to `roles.name`
UPDATE `users` u
JOIN `roles` r ON u.`role` = r.`name`
SET u.`role_id` = r.`id`;

-- 4. Set fallback `role_id` for users that might have had broken enum constraints (optional safe-guard)
UPDATE `users` SET `role_id` = (SELECT `id` FROM `roles` WHERE `name` = 'guest' LIMIT 1) WHERE `role_id` IS NULL;

-- 5. Enforce NOT NULL for `role_id` now that data is migrated
ALTER TABLE `users` 
MODIFY COLUMN `role_id` INT NOT NULL;

-- 6. Add Foreign Key Constraint
ALTER TABLE `users`
ADD CONSTRAINT `fk_users_roles` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT;

-- 7. Drop the old `role` column
ALTER TABLE `users`
DROP COLUMN `role`;
