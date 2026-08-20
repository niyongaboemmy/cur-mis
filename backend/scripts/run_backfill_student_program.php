<?php
/**
 * One-shot runner for migration 062 (backfill_student_program_option.sql).
 * Prints before/after counts so you can see how many rows were touched.
 */
require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

$host = $_ENV['DB_HOST']     ?? '127.0.0.1';
$port = $_ENV['DB_PORT']     ?? '8889';
$db   = $_ENV['DB_DATABASE'] ?? 'cur_mis';
$user = $_ENV['DB_USERNAME'] ?? 'root';
$pass = $_ENV['DB_PASSWORD'] ?? 'root';

$dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4";
$pdo = new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

function counts(PDO $pdo): array
{
    $row = $pdo->query("
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN std_option IS NULL OR TRIM(std_option) = '' OR TRIM(std_option) = '0' THEN 1 ELSE 0 END) AS missing_option,
            SUM(CASE WHEN department IS NULL OR TRIM(department) = '' OR TRIM(department) = '0' THEN 1 ELSE 0 END) AS missing_dept
        FROM `student`
    ")->fetch(PDO::FETCH_ASSOC);
    return [
        'total'          => (int)$row['total'],
        'missing_option' => (int)$row['missing_option'],
        'missing_dept'   => (int)$row['missing_dept'],
    ];
}

$before = counts($pdo);
echo "Before:\n";
echo "  total students        : {$before['total']}\n";
echo "  missing std_option    : {$before['missing_option']}\n";
echo "  missing department    : {$before['missing_dept']}\n\n";

$file = __DIR__ . '/../database/migrations/2026_05_09_042_backfill_student_program_option.sql';
$sql  = file_get_contents($file);

// Strip line comments before splitting so the splitter doesn't misclassify
// fragments that begin with a `-- Step …` header.
$lines = explode("\n", $sql);
$clean = [];
foreach ($lines as $line) {
    $stripped = preg_replace('/--.*$/', '', $line);
    $clean[]  = $stripped;
}
$cleanSql = implode("\n", $clean);

$statements = array_filter(array_map('trim', explode(';', $cleanSql)));
$idx = 0;
foreach ($statements as $stmt) {
    if ($stmt === '') continue;
    $idx++;
    // Pull the verb so the log line reads sensibly.
    preg_match('/^\s*(\w+)/', $stmt, $m);
    $verb = strtoupper($m[1] ?? 'SQL');
    try {
        $affected = $pdo->exec($stmt);
        echo sprintf("  Step %d (%s) — %d row(s) updated\n", $idx, $verb, $affected);
    } catch (PDOException $e) {
        echo "  ERROR in step {$idx}: " . $e->getMessage() . "\n";
        exit(1);
    }
}

$after = counts($pdo);
echo "\nAfter:\n";
echo "  total students        : {$after['total']}\n";
echo "  missing std_option    : {$after['missing_option']}\n";
echo "  missing department    : {$after['missing_dept']}\n";

echo "\nDone.\n";
