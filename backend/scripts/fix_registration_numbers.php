<?php
/**
 * Fix script to correct registration number prefixes
 *
 * Changes registration numbers from 1CUR to 2CUR for Masters/PGDE/PhD students
 * and 2CUR to 1CUR for Undergraduate students (if any exist).
 *
 * IMPORTANT: Creates a backup before making changes
 * Usage: php backend/scripts/fix_registration_numbers.php
 */

require_once __DIR__ . '/../../backend/bootstrap.php';

use Core\Database;

$db = Database::getInstance();

echo "🔧 Registration Number Fix Script\n";
echo str_repeat("=", 80) . "\n\n";

// Step 1: Identify wrong registrations
$sql = "
    SELECT
        s.id,
        s.regnumber,
        s.fname,
        s.lname,
        s.programme_level,
        SUBSTRING(s.regnumber, 1, 1) as current_prefix,
        CASE
            WHEN s.programme_level IN ('masters', 'pgde', 'phd') THEN 2
            ELSE 1
        END as correct_prefix
    FROM student s
    WHERE
        (s.programme_level IN ('masters', 'pgde', 'phd') AND SUBSTRING(s.regnumber, 1, 1) = '1') OR
        (s.programme_level NOT IN ('masters', 'pgde', 'phd') AND SUBSTRING(s.regnumber, 1, 1) = '2')
    ORDER BY s.id
";

$wrongStudents = $db->fetchAll($sql, []);

if (empty($wrongStudents)) {
    echo "✅ No students with wrong registration number prefixes found.\n";
    exit(0);
}

echo "🚨 Found " . count($wrongStudents) . " students with wrong prefixes.\n\n";

// Show what will be changed
echo "📋 CHANGES TO BE MADE:\n";
echo str_repeat("-", 80) . "\n";
echo sprintf("%-20s %-30s %-12s %-12s\n", "Current", "Name", "Level", "New");
echo str_repeat("-", 80) . "\n";

foreach ($wrongStudents as $row) {
    $name = substr($row['fname'] . ' ' . $row['lname'], 0, 28);
    $newReg = $row['correct_prefix'] . substr($row['regnumber'], 1);
    printf(
        "%-20s %-30s %-12s %-12s\n",
        $row['regnumber'],
        $name,
        $row['programme_level'],
        $newReg
    );
}

echo "\n";

// Ask for confirmation
echo "⚠️  WARNING: This will modify student records!\n";
echo "Continue? (type 'YES' to confirm): ";
$input = trim(fgets(STDIN));

if ($input !== 'YES') {
    echo "❌ Cancelled. No changes made.\n";
    exit(1);
}

echo "\n🔄 Processing...\n\n";

// Create backup table
$backupTable = "student_backup_" . date('YmdHis');
$db->execute("CREATE TABLE {$backupTable} LIKE student");
$db->execute("INSERT INTO {$backupTable} SELECT * FROM student WHERE SUBSTRING(regnumber, 1, 1) IN ('1', '2') AND regnumber LIKE '%CUR%'");

echo "✅ Backup created: {$backupTable}\n\n";

// Fix each student
$fixed = 0;
foreach ($wrongStudents as $row) {
    $newReg = $row['correct_prefix'] . substr($row['regnumber'], 1);

    $db->execute(
        "UPDATE student SET regnumber = ? WHERE id = ?",
        [$newReg, $row['id']]
    );

    $fixed++;
    echo "✓ Fixed: {$row['regnumber']} → {$newReg} ({$row['fname']} {$row['lname']})\n";
}

echo "\n" . str_repeat("=", 80) . "\n";
echo "✨ Fixed {$fixed} student registration numbers!\n";
echo "📋 Backup table: {$backupTable}\n";
echo "\n💡 To rollback, run:\n";
echo "   INSERT INTO student SELECT * FROM {$backupTable};\n";
echo "\n✅ All done!\n";
