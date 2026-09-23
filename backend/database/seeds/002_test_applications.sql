-- Test Application Data for Edit/Delete Testing
-- Populates student_applications with realistic test data

-- Insert test applicant profile (required for linking documents)
INSERT INTO `applicant_profiles` (
    `email`, `phone`, `first_name`, `last_name`, `gender`, `birthdate`,
    `nationality`, `address`, `created_at`, `updated_at`
) VALUES (
    'testapplicant@example.com',
    '+250788123456',
    'John',
    'Doe',
    'M',
    '2000-05-15',
    'Rwandan',
    '123 Test Street, Kigali',
    NOW(),
    NOW()
) ON DUPLICATE KEY UPDATE `updated_at` = NOW();

-- Get the applicant profile ID (use the one we just inserted or existing)
SET @applicant_id = LAST_INSERT_ID();
IF @applicant_id = 0 THEN
    SELECT `id` INTO @applicant_id FROM `applicant_profiles`
    WHERE `email` = 'testapplicant@example.com' LIMIT 1;
END IF;

-- Insert test student application
INSERT INTO `student_applications` (
    `application_number`,
    `academic_year_id`,
    `faculty_id`,
    `program_id`,
    `intake`,
    `first_name`,
    `last_name`,
    `email`,
    `phone`,
    `gender`,
    `birthdate`,
    `nationality`,
    `address`,
    `prev_school`,
    `prev_qualification`,
    `prev_grade`,
    `combination`,
    `graduation_year`,
    `sponsorship`,
    `status`,
    `document_status`,
    `submitted_at`,
    `created_at`,
    `updated_at`,
    `campus_id`,
    `mode_of_study`,
    `level_id`
) VALUES (
    'APP-2026-TEST-001',
    1,  -- academic_year_id (adjust based on your data)
    1,  -- faculty_id
    1,  -- program_id
    '2026-A',
    'John',
    'Doe',
    'testapplicant@example.com',
    '+250788123456',
    'M',
    '2000-05-15',
    'Rwandan',
    '123 Test Street, Kigali',
    'Kigali High School',
    'Rwanda Leaving Certificate',
    '82.5',
    'MCB',
    2023,
    'self',
    'submitted',
    'under_review',
    NOW(),
    NOW(),
    NOW(),
    1,  -- campus_id
    1,  -- mode_of_study (1 = Day)
    1   -- level_id
) ON DUPLICATE KEY UPDATE
    `updated_at` = NOW(),
    `first_name` = VALUES(`first_name`),
    `last_name` = VALUES(`last_name`),
    `email` = VALUES(`email`),
    `phone` = VALUES(`phone`),
    `campus_id` = VALUES(`campus_id`),
    `mode_of_study` = VALUES(`mode_of_study`),
    `level_id` = VALUES(`level_id`);

-- Get the application ID
SELECT @app_id := `id` FROM `student_applications`
WHERE `application_number` = 'APP-2026-TEST-001' LIMIT 1;

-- Insert status history log
INSERT INTO `application_status_logs` (
    `application_id`,
    `old_status`,
    `new_status`,
    `changed_by_id`,
    `changed_by_type`,
    `reason`,
    `created_at`
) VALUES (
    @app_id,
    'draft',
    'submitted',
    NULL,
    'system',
    'Test application created',
    NOW()
);

-- Insert pending note
INSERT INTO `application_pending_notes` (
    `application_id`,
    `note`,
    `added_by_id`,
    `added_by_type`,
    `created_at`
) VALUES (
    @app_id,
    'Test application for edit/delete feature testing. You can safely modify or delete this record.',
    NULL,
    'system',
    NOW()
);

-- Alternative: If you want to seed application #78 specifically (check current data first)
-- Uncomment below and adjust the query to find actual application #78
/*
UPDATE `student_applications` SET
    `first_name` = 'Jane',
    `last_name` = 'Smith',
    `email` = 'jane.smith@example.com',
    `phone` = '+250788654321',
    `campus_id` = 1,
    `mode_of_study` = 2,  -- Evening
    `level_id` = 1,
    `updated_at` = NOW()
WHERE `id` = 78;
*/
