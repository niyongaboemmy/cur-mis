#!/usr/bin/env php
<?php

declare(strict_types=1);

// Load database configuration
require_once dirname(__DIR__) . '/config/database.php';
require_once dirname(__DIR__) . '/core/Database.php';

use Core\Database;

$db = Database::getInstance();

echo "\n╔════════════════════════════════════════════════════════════════╗\n";
echo "║          Test Application Seeder for Edit/Delete Testing        ║\n";
echo "╚════════════════════════════════════════════════════════════════╝\n\n";

try {
    // 1. Check if test applicant profile exists
    $applicantProfile = $db->fetchOne(
        "SELECT `id` FROM `applicant_profiles` WHERE `email` = 'testapplicant@example.com'"
    );

    if (!$applicantProfile) {
        echo "📝 Creating applicant profile...\n";
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
            )"
        );
        $applicantId = $db->lastInsertId();
    } else {
        $applicantId = (int)$applicantProfile['id'];
        echo "✅ Applicant profile exists (ID: {$applicantId})\n";
    }

    // 2. Get active academic year
    $academicYear = $db->fetchOne(
        "SELECT `id` FROM `academic_years` WHERE `is_active` = 1 ORDER BY `id` DESC LIMIT 1"
    );
    $academicYearId = (int)($academicYear['id'] ?? 1);
    echo "📅 Academic Year ID: {$academicYearId}\n";

    // 3. Get a faculty
    $faculty = $db->fetchOne("SELECT `fac_id` FROM `faculty` LIMIT 1");
    $facultyId = (int)($faculty['fac_id'] ?? 1);
    echo "🏫 Faculty ID: {$facultyId}\n";

    // 4. Get a program
    $program = $db->fetchOne("SELECT `id` FROM `programs` WHERE `is_active` = 1 LIMIT 1");
    $programId = (int)($program['id'] ?? 1);
    echo "📚 Program ID: {$programId}\n";

    // 5. Get a campus
    $campus = $db->fetchOne("SELECT `id` FROM `campus` LIMIT 1");
    $campusId = (int)($campus['id'] ?? 1);
    echo "🏢 Campus ID: {$campusId}\n";

    // 6. Get a level
    $level = $db->fetchOne("SELECT `id` FROM `levels` LIMIT 1");
    $levelId = (int)($level['id'] ?? 1);
    echo "📊 Level ID: {$levelId}\n\n";

    // 7. Check if test application already exists
    $existingApp = $db->fetchOne(
        "SELECT `id`, `application_number` FROM `student_applications` WHERE `email` = 'testapplicant@example.com'"
    );

    if ($existingApp) {
        echo "ℹ️  Test application already exists!\n";
        echo "   ID: {$existingApp['id']}\n";
        echo "   Number: {$existingApp['application_number']}\n\n";
        echo "🔄 Updating application data...\n";

        $db->execute(
            "UPDATE `student_applications` SET
                `first_name` = 'John',
                `last_name` = 'Doe',
                `email` = 'testapplicant@example.com',
                `phone` = '+250788123456',
                `gender` = 'M',
                `birthdate` = '2000-05-15',
                `prev_school` = 'Kigali High School',
                `prev_qualification` = 'Rwanda Leaving Certificate',
                `prev_grade` = '82.5',
                `combination` = 'MCB',
                `graduation_year` = 2023,
                `sponsorship` = 'self',
                `status` = 'submitted',
                `document_status` = 'under_review',
                `campus_id` = ?,
                `mode_of_study` = 1,
                `level_id` = ?,
                `updated_at` = NOW()
            WHERE `id` = ?",
            [$campusId, $levelId, $existingApp['id']]
        );

        $applicationId = (int)$existingApp['id'];
        echo "✅ Application updated!\n";
    } else {
        echo "✨ Creating new test application...\n";

        $appNumber = 'APP-TEST-' . strtoupper(substr(uniqid(), -6));
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
                `campus_id`,
                `mode_of_study`,
                `level_id`,
                `created_at`,
                `updated_at`
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, NOW(), NOW())",
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
                $campusId,
                1,  // mode_of_study: 1 = Day
                $levelId
            ]
        );

        $applicationId = $db->lastInsertId();
        echo "✅ Application created!\n";
        echo "   Application Number: {$appNumber}\n";
    }

    // 8. Get application details
    $app = $db->fetchOne(
        "SELECT * FROM `student_applications` WHERE `id` = ?",
        [$applicationId]
    );

    echo "\n╔════════════════════════════════════════════════════════════════╗\n";
    echo "║                    Test Application Ready                       ║\n";
    echo "╚════════════════════════════════════════════════════════════════╝\n\n";

    echo "📋 Application Details:\n";
    echo "   ID: {$app['id']}\n";
    echo "   Number: {$app['application_number']}\n";
    echo "   Name: {$app['first_name']} {$app['last_name']}\n";
    echo "   Email: {$app['email']}\n";
    echo "   Phone: {$app['phone']}\n";
    echo "   Campus ID: {$app['campus_id']}\n";
    echo "   Mode of Study: {$app['mode_of_study']} (1=Day, 2=Evening, 3=Weekend, 4=Holiday, 5=Distance)\n";
    echo "   Level ID: {$app['level_id']}\n";
    echo "   Status: {$app['status']}\n";
    echo "   Created: {$app['created_at']}\n\n";

    echo "🔗 Access the application at:\n";
    echo "   https://cur.ac.rw/umis/admin/applications/{$applicationId}\n\n";

    echo "✨ You can now:\n";
    echo "   • Click the Edit button (pencil icon) to modify the application\n";
    echo "   • Click the Delete button to remove the application\n";
    echo "   • Change: First Name, Last Name, Email, Phone, Campus, Mode of Study, Level, Intake\n\n";

} catch (\Exception $e) {
    echo "❌ Error: {$e->getMessage()}\n";
    echo "   File: {$e->getFile()}\n";
    echo "   Line: {$e->getLine()}\n";
    exit(1);
}

exit(0);
