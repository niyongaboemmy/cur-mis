<?php
require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();
$pdo = new PDO(
    "mysql:host={$_ENV['DB_HOST']};port={$_ENV['DB_PORT']};dbname={$_ENV['DB_DATABASE']};charset=utf8mb4",
    $_ENV['DB_USERNAME'], $_ENV['DB_PASSWORD'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);

$opt = $pdo->query("SELECT id, name, code, acro, department_id FROM `options` WHERE id = 8")->fetch(PDO::FETCH_ASSOC);
if (!$opt) { echo "Option 8 does not exist.\n"; exit; }
print_r($opt);

$counts = [];
foreach ([
    "std_option = '8'"                                 => "std_option_eq_id",
    "LOWER(TRIM(std_option)) = LOWER('{$opt['name']}')" => "std_option_eq_name",
    "LOWER(TRIM(program))    = LOWER('{$opt['name']}')" => "program_eq_name",
] as $where => $key) {
    $counts[$key] = (int)$pdo->query("SELECT COUNT(*) FROM `student` WHERE $where")->fetchColumn();
}
print_r($counts);

echo "\nAdmission chain: ";
$ac = (int)$pdo->query("
    SELECT COUNT(DISTINCT s.id) FROM `student` s
    JOIN `admission_offers` ao ON ao.student_id = s.id
    JOIN `student_applications` sa ON sa.id = ao.application_id
    WHERE sa.program_id = 8
")->fetchColumn();
echo $ac, "\n";

echo "Applicant_profiles chain: ";
$pc = (int)$pdo->query("
    SELECT COUNT(DISTINCT s.id) FROM `student` s
    JOIN `applicant_profiles` ap ON ap.user_id = s.user_id
    JOIN `student_applications` sa ON sa.id = ap.application_id
    WHERE sa.program_id = 8
")->fetchColumn();
echo $pc, "\n";
