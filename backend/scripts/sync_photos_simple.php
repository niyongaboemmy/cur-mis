<?php

/**
 * Simple script to sync applicant photos to student records
 * No dependencies, direct database connection
 */

// Database config - adjust as needed
$host = '127.0.0.1';
$db = 'curac_save';
$user = 'root';
$pass = '';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_THROW);

    // Get all enrolled students without photos but who have applicant photos
    $stmt = $pdo->prepare("
        SELECT
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
         AND COALESCE(ap.profile_photo_id, u.photo) != ''
    ");

    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($rows)) {
        echo "[INFO] No students to update — all enrolled students already have photos.\n";
        exit(0);
    }

    echo "[INFO] Found " . count($rows) . " students to update.\n\n";

    $updated = 0;
    $failed = 0;

    $updateStmt = $pdo->prepare("UPDATE `student` SET photo = ?, updated_at = NOW() WHERE id = ?");

    foreach ($rows as $row) {
        $studentId = (int)$row['id'];
        $photoId = trim((string)$row['applicant_photo_id']);
        $regNumber = $row['regnumber'] ?? 'unknown';
        $name = trim(($row['fname'] ?? '') . ' ' . ($row['lname'] ?? ''));

        try {
            $updateStmt->execute([$photoId, $studentId]);
            echo "[✓] {$regNumber} ({$name}) — synced\n";
            $updated++;
        } catch (Exception $e) {
            echo "[✗] {$regNumber} ({$name}) — " . $e->getMessage() . "\n";
            $failed++;
        }
    }

    echo "\n[COMPLETE] Updated {$updated} students, failed {$failed}.\n";

} catch (PDOException $e) {
    echo "[ERROR] Database connection failed: " . $e->getMessage() . "\n";
    exit(1);
}
