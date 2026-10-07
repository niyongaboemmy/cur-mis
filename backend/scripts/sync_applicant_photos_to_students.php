<?php

declare(strict_types=1);

/**
 * Backfill student.photo from applicant_profiles.profile_photo_id
 *
 * Copies profile photos from enrolled applicants to their corresponding
 * student records so photos display on the StudentDetailsPage.
 *
 * Usage: php backend/scripts/sync_applicant_photos_to_students.php
 */

$basePath = dirname(__DIR__);
require $basePath . '/vendor/autoload.php';

use Core\Database;

$db = Database::getInstance();

try {
    // Find all students who have an enrolled application with a profile photo
    // but whose student.photo is null or empty
    $rows = $db->fetchAll(
        "SELECT
            s.id,
            s.regnumber,
            s.fname,
            s.lname,
            COALESCE(ap.profile_photo_id, u.photo) AS applicant_photo_id
         FROM `student` s
         INNER JOIN `student_applications` sa ON sa.student_id = s.id
         LEFT JOIN `applicant_profiles` ap ON ap.application_id = sa.id
         LEFT JOIN `users` u ON u.id = ap.user_id
         WHERE sa.status = 'enrolled'
         AND (s.photo IS NULL OR s.photo = '')
         AND COALESCE(ap.profile_photo_id, u.photo) IS NOT NULL
         AND COALESCE(ap.profile_photo_id, u.photo) != ''",
        []
    );

    if (empty($rows)) {
        echo "[INFO] No students to update — all enrolled students already have photos.\n";
        exit(0);
    }

    echo "[INFO] Found " . count($rows) . " students to update.\n";

    $updated = 0;
    $skipped = 0;

    foreach ($rows as $row) {
        $studentId = (int)$row['id'];
        $photoId = trim((string)$row['applicant_photo_id']);
        $regNumber = $row['regnumber'] ?? 'unknown';
        $name = trim(($row['fname'] ?? '') . ' ' . ($row['lname'] ?? ''));

        if (empty($photoId)) {
            echo "[SKIP] {$regNumber} ({$name}) — no photo to sync\n";
            $skipped++;
            continue;
        }

        try {
            $db->execute(
                "UPDATE `student` SET photo = ?, updated_at = NOW() WHERE id = ?",
                [$photoId, $studentId]
            );
            echo "[OK] {$regNumber} ({$name}) — synced photo {$photoId}\n";
            $updated++;
        } catch (\Throwable $e) {
            echo "[ERROR] {$regNumber} ({$name}) — " . $e->getMessage() . "\n";
            $skipped++;
        }
    }

    echo "\n[COMPLETE] Updated {$updated} students, skipped {$skipped}.\n";

} catch (\Throwable $e) {
    echo "[FATAL] " . $e->getMessage() . "\n";
    exit(1);
}
