-- Activate NGOMA LEARNING CENTER campus
-- Issue: NGOMA campus was marked as inactive (is_active = 0),
-- causing it to be filtered out from the campus dropdown in application forms.
-- This migration reactivates it.

UPDATE `campuses`
SET `is_active` = 1, `updated_at` = NOW()
WHERE `code` = 'NGOMA' AND `name` LIKE '%NGOMA%' AND `is_active` = 0;

-- Verify the update
SELECT id, name, code, is_active, updated_at FROM `campuses` WHERE `code` = 'NGOMA';
