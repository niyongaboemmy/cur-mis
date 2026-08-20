<?php
/**
 * Narrow data fix: where a student sits in a department whose catalog has
 * exactly ONE active option, set their `std_option` to that option's id.
 * No guessing — there's only one valid value the option could take.
 *
 * Departments with multiple options (Didactics, Public Health, etc.) and
 * departments with no options are left untouched. The `program` text field is
 * also synced to the option's name when std_option lands.
 */
require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

$pdo = new PDO(
    "mysql:host={$_ENV['DB_HOST']};port={$_ENV['DB_PORT']};dbname={$_ENV['DB_DATABASE']};charset=utf8mb4",
    $_ENV['DB_USERNAME'], $_ENV['DB_PASSWORD'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);

$beforeMissing = (int)$pdo->query("
    SELECT COUNT(*) FROM `student`
    WHERE std_option IS NULL OR TRIM(std_option) IN ('','0')
")->fetchColumn();
echo "Before: {$beforeMissing} students missing std_option\n\n";

// Show which departments will be touched.
$preview = $pdo->query("
    SELECT d.dep_id, d.dep_name, COUNT(*) AS students, MIN(o.id) AS opt_id, MIN(o.name) AS opt_name
    FROM `student` s
    JOIN `departements` d ON CAST(d.dep_id AS CHAR) = TRIM(s.department)
    JOIN (
        SELECT department_id, MIN(id) AS opt_id, COUNT(*) AS cnt
        FROM `options`
        WHERE is_active = 1 OR is_active IS NULL
        GROUP BY department_id
        HAVING COUNT(*) = 1
    ) one_opt ON one_opt.department_id = d.dep_id
    JOIN `options` o ON o.id = one_opt.opt_id
    WHERE s.std_option IS NULL OR TRIM(s.std_option) IN ('','0')
    GROUP BY d.dep_id, d.dep_name
    ORDER BY students DESC
")->fetchAll(PDO::FETCH_ASSOC);

echo "Departments with exactly 1 option (will be backfilled):\n";
$total = 0;
foreach ($preview as $row) {
    printf("  dept=%-3d %-50s → opt %-3d (%s) — %d students\n",
        $row['dep_id'], $row['dep_name'], $row['opt_id'], $row['opt_name'], $row['students']);
    $total += (int)$row['students'];
}
echo "  ── Total to update: {$total} students\n\n";

// Run the update.
$affectedOpt = $pdo->exec("
    UPDATE `student` s
    JOIN (
        SELECT department_id, MIN(id) AS opt_id
        FROM `options`
        WHERE is_active = 1 OR is_active IS NULL
        GROUP BY department_id
        HAVING COUNT(*) = 1
    ) one_opt ON CAST(one_opt.department_id AS CHAR) = TRIM(s.department)
    SET s.std_option = CAST(one_opt.opt_id AS CHAR)
    WHERE (s.std_option IS NULL OR s.std_option = '' OR s.std_option = '0')
      AND s.department IS NOT NULL AND TRIM(s.department) <> ''
");
echo "std_option assigned : {$affectedOpt} rows\n";

// Sync the legacy `program` text to the option name where it's empty.
$affectedTxt = $pdo->exec("
    UPDATE `student` s
    JOIN `options` o ON CAST(o.id AS CHAR) = TRIM(s.std_option)
    SET s.program = o.name
    WHERE s.std_option IS NOT NULL AND TRIM(s.std_option) NOT IN ('','0')
      AND (s.program IS NULL OR TRIM(s.program) = '')
");
echo "program text synced : {$affectedTxt} rows\n";

$afterMissing = (int)$pdo->query("
    SELECT COUNT(*) FROM `student`
    WHERE std_option IS NULL OR TRIM(std_option) IN ('','0')
")->fetchColumn();
echo "\nAfter:  {$afterMissing} students missing std_option (was {$beforeMissing})\n";
echo "Done.\n";
