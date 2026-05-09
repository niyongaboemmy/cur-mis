<?php
/** Diagnose what shape student.program/std_option/department actually take
 *  across the whole dataset, so we know which backfill rules can land. */
require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

$pdo = new PDO(
    "mysql:host={$_ENV['DB_HOST']};port={$_ENV['DB_PORT']};dbname={$_ENV['DB_DATABASE']};charset=utf8mb4",
    $_ENV['DB_USERNAME'], $_ENV['DB_PASSWORD'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);

echo "── Buckets ──\n";
$rows = $pdo->query("
    SELECT
      SUM(std_option IS NULL OR TRIM(std_option) IN ('','0')) AS no_opt,
      SUM(std_option IS NOT NULL AND TRIM(std_option) NOT IN ('','0')) AS has_opt,
      SUM(department IS NULL OR TRIM(department) IN ('','0')) AS no_dept,
      SUM(program IS NULL OR TRIM(program) = '') AS no_program_txt,
      SUM(faculty IS NULL OR TRIM(faculty) IN ('','0')) AS no_fac
    FROM `student`
")->fetch(PDO::FETCH_ASSOC);
foreach ($rows as $k => $v) printf("  %-18s : %d\n", $k, $v);

echo "\n── Top 20 distinct `program` text values among students missing std_option ──\n";
$stmt = $pdo->query("
    SELECT TRIM(program) AS p, COUNT(*) AS cnt
    FROM `student`
    WHERE std_option IS NULL OR TRIM(std_option) IN ('','0')
    GROUP BY TRIM(program)
    ORDER BY cnt DESC
    LIMIT 20
");
while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
    printf("  %5d × %s\n", $r['cnt'], $r['p'] === '' ? '(empty)' : $r['p']);
}

echo "\n── Sample 10 students missing std_option ──\n";
$stmt = $pdo->query("
    SELECT regnumber, fname, lname, faculty, department, program, std_option, current_level
    FROM `student`
    WHERE std_option IS NULL OR TRIM(std_option) IN ('','0')
    LIMIT 10
");
while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
    printf("  %s · fac=%s dept=%s prog=%s opt=%s lvl=%s — %s %s\n",
        $r['regnumber'] ?? '?', $r['faculty'] ?? '-', $r['department'] ?? '-',
        $r['program'] ?? '-', $r['std_option'] ?? '-', $r['current_level'] ?? '-',
        $r['fname'] ?? '', $r['lname'] ?? '');
}

echo "\n── Distinct departments these students sit in ──\n";
$stmt = $pdo->query("
    SELECT TRIM(s.department) AS dept_id, d.dep_name, COUNT(*) AS students,
           (SELECT COUNT(*) FROM `options` o WHERE o.department_id = d.dep_id) AS option_count
    FROM `student` s
    LEFT JOIN `departements` d ON CAST(d.dep_id AS CHAR) = TRIM(s.department)
    WHERE s.std_option IS NULL OR TRIM(s.std_option) IN ('','0')
    GROUP BY TRIM(s.department), d.dep_name, d.dep_id
    ORDER BY students DESC
");
while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
    printf("  dept=%-4s | %-50s | %5d students | %d options in dept\n",
        $r['dept_id'] ?? '-', $r['dep_name'] ?? '(unknown)',
        $r['students'], $r['option_count']);
}
