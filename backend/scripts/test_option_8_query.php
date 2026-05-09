<?php
/** Sanity test: simulate the new index() query for std_option=8 alone. */
require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();
$pdo = new PDO(
    "mysql:host={$_ENV['DB_HOST']};port={$_ENV['DB_PORT']};dbname={$_ENV['DB_DATABASE']};charset=utf8mb4",
    $_ENV['DB_USERNAME'], $_ENV['DB_PASSWORD'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);

$opt = $pdo->query("SELECT id, name, code, acro FROM `options` WHERE id = 8")->fetch(PDO::FETCH_ASSOC);
$aliases = ['8'];
foreach (['name','code','acro'] as $f) if (!empty($opt[$f])) $aliases[] = $opt[$f];

$sub = []; $bind = [];
foreach ($aliases as $a) {
    $sub[] = 'LOWER(TRIM(std_option)) = LOWER(?)'; $bind[] = $a;
    $sub[] = 'LOWER(TRIM(program))    = LOWER(?)'; $bind[] = $a;
}
$sub[] = "id IN (SELECT ao.student_id FROM admission_offers ao JOIN student_applications sa ON sa.id = ao.application_id WHERE sa.program_id = ?)";
$bind[] = 8;
$sub[] = "user_id IN (SELECT ap.user_id FROM applicant_profiles ap JOIN student_applications sa2 ON sa2.id = ap.application_id WHERE sa2.program_id = ? AND ap.user_id IS NOT NULL)";
$bind[] = 8;

$where = '(' . implode(' OR ', $sub) . ')';
$total = $pdo->prepare("SELECT COUNT(*) FROM student WHERE $where");
$total->execute($bind);
echo "Total matching std_option=8 (post-fix): " . $total->fetchColumn() . "\n";

$rows = $pdo->prepare("SELECT regnumber, fname, lname, std_option, program, department FROM student WHERE $where LIMIT 10");
$rows->execute($bind);
foreach ($rows->fetchAll(PDO::FETCH_ASSOC) as $r) {
    printf("  %s — %s %s — opt=%s prog=%s dept=%s\n",
        $r['regnumber'] ?? '?', $r['fname'], $r['lname'], $r['std_option'], $r['program'], $r['department']);
}
