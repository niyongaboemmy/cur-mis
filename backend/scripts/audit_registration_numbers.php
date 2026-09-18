<?php
/**
 * Audit script to identify students with potentially incorrect registration number prefixes
 *
 * Issue: Students in Masters or PGDE programmes may have 1CUR... instead of 2CUR...
 * if programme_category was not properly captured during admission.
 *
 * This script generates a report of mismatched registrations.
 * Usage: php backend/scripts/audit_registration_numbers.php
 */

require_once __DIR__ . '/../../backend/bootstrap.php';

use Core\Database;

$db = Database::getInstance();

echo "🔍 Auditing Registration Numbers...\n";
echo str_repeat("=", 80) . "\n\n";

// Query to find students with potentially wrong regnumber prefixes
$sql = "
    SELECT
        s.id,
        s.regnumber,
        s.fname,
        s.lname,
        s.programme_level,
        s.programme_category,
        m.dep_name as programme_name,
        SUBSTRING(s.regnumber, 1, 1) as regnumber_prefix,
        CASE
            WHEN s.programme_level IN ('masters', 'pgde', 'phd') THEN 2
            ELSE 1
        END as expected_prefix,
        CASE
            WHEN s.programme_level IN ('masters', 'pgde', 'phd') AND SUBSTRING(s.regnumber, 1, 1) = '1' THEN 'WRONG'
            WHEN s.programme_level NOT IN ('masters', 'pgde', 'phd') AND SUBSTRING(s.regnumber, 1, 1) = '2' THEN 'WRONG'
            ELSE 'OK'
        END as status
    FROM student s
    LEFT JOIN departements m ON s.department = m.dep_id
    WHERE
        s.regnumber LIKE '1CUR%' OR
        s.regnumber LIKE '2CUR%'
    ORDER BY status DESC, s.id DESC
";

$results = $db->fetchAll($sql, []);

if (empty($results)) {
    echo "✅ No students found with CUR registration numbers.\n";
    exit(0);
}

// Group by status
$wrong = array_filter($results, fn($r) => $r['status'] === 'WRONG');
$correct = array_filter($results, fn($r) => $r['status'] === 'OK');

echo "📊 SUMMARY\n";
echo str_repeat("-", 80) . "\n";
echo "Total CUR students: " . count($results) . "\n";
echo "  ✅ Correct prefix:  " . count($correct) . "\n";
echo "  ❌ Wrong prefix:    " . count($wrong) . "\n\n";

if (empty($wrong)) {
    echo "✨ All students have correct registration number prefixes!\n";
    exit(0);
}

echo "⚠️  STUDENTS WITH WRONG PREFIXES\n";
echo str_repeat("-", 80) . "\n";
echo sprintf(
    "%-15s %-20s %-30s %-15s %-12s\n",
    "RegNumber",
    "Name",
    "Programme",
    "Level",
    "Category"
);
echo str_repeat("-", 80) . "\n";

foreach ($wrong as $row) {
    $name = $row['fname'] . ' ' . $row['lname'];
    $programme = substr($row['programme_name'] ?? 'N/A', 0, 28);
    printf(
        "%-15s %-20s %-30s %-15s %-12s\n",
        $row['regnumber'],
        substr($name, 0, 18),
        $programme,
        $row['programme_level'] ?? 'N/A',
        $row['programme_category'] ?? 'NULL'
    );
}

echo "\n" . str_repeat("=", 80) . "\n";
echo "\n📝 NEXT STEPS:\n";
echo "1. Review the list above for accuracy\n";
echo "2. A migration script can be run to update wrong prefixes\n";
echo "3. Ensure programme_category is captured during admission\n";
echo "\n";

// Output as JSON for easier processing
$jsonFile = __DIR__ . '/../../audit_regnumbers_' . date('Y-m-d-His') . '.json';
file_put_contents($jsonFile, json_encode([
    'timestamp' => date('Y-m-d H:i:s'),
    'total_students' => count($results),
    'correct' => count($correct),
    'wrong' => count($wrong),
    'wrong_students' => array_values($wrong)
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

echo "✅ Detailed report saved to: " . basename($jsonFile) . "\n";
