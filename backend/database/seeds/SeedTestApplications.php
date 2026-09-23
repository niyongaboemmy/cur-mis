<?php

declare(strict_types=1);

namespace Database\Seeds;

use Core\Database;

class SeedTestApplications
{
    public static function run(): void
    {
        $db = Database::getInstance();

        try {
            // 1. Insert test applicant profile
            $db->execute(
                "INSERT INTO `applicant_profiles` (
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
                ) ON DUPLICATE KEY UPDATE `updated_at` = NOW()"
            );

            // 2. Get the applicant profile ID
            $applicantProfile = $db->fetchOne(
                "SELECT `id` FROM `applicant_profiles` WHERE `email` = 'testapplicant@example.com'"
            );
            $applicantId = (int)$applicantProfile['id'];

            // 3. Get active academic year
            $academicYear = $db->fetchOne(
                "SELECT `id` FROM `academic_years` WHERE `is_active` = 1 ORDER BY `id` DESC LIMIT 1"
            );
            $academicYearId = (int)($academicYear['id'] ?? 1);

            // 4. Get a faculty
            $faculty = $db->fetchOne(
                "SELECT `fac_id` FROM `faculty` LIMIT 1"
            );
            $facultyId = (int)($faculty['fac_id'] ?? 1);

            // 5. Get a program
            $program = $db->fetchOne(
                "SELECT `id` FROM `programs` WHERE `is_active` = 1 LIMIT 1"
            );
            $programId = (int)($program['id'] ?? 1);

            // 6. Get a campus
            $campus = $db->fetchOne(
                "SELECT `id` FROM `campus` LIMIT 1"
            );
            $campusId = (int)($campus['id'] ?? 1);

            // 7. Get a level
            $level = $db->fetchOne(
                "SELECT `id` FROM `levels` LIMIT 1"
            );
            $levelId = (int)($level['id'] ?? 1);

            // 8. Insert test application
            $appNumber = 'APP-2026-TEST-' . date('His');
            $db->execute(
                "INSERT INTO `student_applications` (
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
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?, ?
                )",
                [
                    $appNumber,
                    $academicYearId,
                    $facultyId,
                    $programId,
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
                    '2026-01-15 10:30:00',
                    $campusId,
                    1,  // mode_of_study (1 = Day)
                    $levelId
                ]
            );

            // 9. Get the application ID
            $application = $db->fetchOne(
                "SELECT `id` FROM `student_applications` WHERE `application_number` = ?",
                [$appNumber]
            );
            $applicationId = (int)$application['id'];

            // 10. Insert status log
            $db->execute(
                "INSERT INTO `application_status_logs` (
                    `application_id`, `old_status`, `new_status`, `changed_by_id`, `changed_by_type`, `reason`, `created_at`
                ) VALUES (?, ?, ?, ?, ?, ?, NOW())",
                [$applicationId, 'draft', 'submitted', null, 'system', 'Test application created']
            );

            // 11. Insert pending note
            $db->execute(
                "INSERT INTO `application_pending_notes` (
                    `application_id`, `note`, `added_by_id`, `added_by_type`, `created_at`
                ) VALUES (?, ?, ?, ?, NOW())",
                [
                    $applicationId,
                    'Test application for edit/delete feature testing. You can safely modify or delete this record.',
                    null,
                    'system'
                ]
            );

            echo "✅ Test application created successfully!\n";
            echo "   Application Number: {$appNumber}\n";
            echo "   Application ID: {$applicationId}\n";
            echo "   Name: John Doe\n";
            echo "   Email: testapplicant@example.com\n";
            echo "   Phone: +250788123456\n";
            echo "   Campus ID: {$campusId}\n";
            echo "   Mode of Study: 1 (Day)\n";
            echo "   Level ID: {$levelId}\n\n";
            echo "You can now edit this application at:\n";
            echo "   https://cur.ac.rw/umis/admin/applications/{$applicationId}\n";

        } catch (\Exception $e) {
            echo "❌ Error seeding test applications: {$e->getMessage()}\n";
            exit(1);
        }
    }
}

// Run if called directly
if (php_sapi_name() === 'cli' && basename($argv[0] ?? '') === basename(__FILE__)) {
    require_once __DIR__ . '/../../core/Database.php';
    SeedTestApplications::run();
}
