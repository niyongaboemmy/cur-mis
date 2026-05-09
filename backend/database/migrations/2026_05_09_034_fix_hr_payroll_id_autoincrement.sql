-- Fix hr_payroll.id: add AUTO_INCREMENT (missing, causing insert failures)
-- Fix hr_payroll.status: add 'Approved' to ENUM (controller allows it)

ALTER TABLE `hr_payroll`
  MODIFY COLUMN `id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  MODIFY COLUMN `status` ENUM('Pending','Paid','Approved') NOT NULL DEFAULT 'Pending';
