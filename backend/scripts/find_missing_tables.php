<?php
/**
 * Find all tables in database and check for student/academic data
 */

require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

$host = $_ENV['DB_HOST'] ?? '127.0.0.1';
$port = $_ENV['DB_PORT'] ?? '3306';
$db   = $_ENV['DB_DATABASE'] ?? 'curac_save';
$user = $_ENV['DB_USERNAME'] ?? 'root';
$pass = $_ENV['DB_PASSWORD'] ?? '';

$pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4", $user, $pass);

echo "\n╔════════════════════════════════════════════════════════════════╗\n";
echo "║              ALL TABLES IN DATABASE                           ║\n";
echo "╚════════════════════════════════════════════════════════════════╝\n\n";

// Get all tables
$stmt = $pdo->query("SHOW TABLES");
$tables = $stmt->fetchAll(PDO::FETCH_COLUMN);

echo "Total tables: " . count($tables) . "\n\n";

// Group tables
$studentTables = [];
$academicTables = [];
$otherTables = [];

foreach ($tables as $table) {
    $lower = strtolower($table);

    if (strpos($lower, 'student') !== false || strpos($lower, 'applicant') !== false) {
        $studentTables[] = $table;
    } elseif (strpos($lower, 'academic') !== false || strpos($lower, 'term') !== false || strpos($lower, 'module') !== false || strpos($lower, 'course') !== false) {
        $academicTables[] = $table;
    } else {
        $otherTables[] = $table;
    }
}

if (!empty($studentTables)) {
    echo "📚 STUDENT-RELATED TABLES (" . count($studentTables) . "):\n";
    foreach ($studentTables as $t) {
        $stmt = $pdo->query("SELECT COUNT(*) FROM `$t`");
        $count = $stmt->fetch(PDO::FETCH_COLUMN);
        echo "  • " . str_pad($t, 35) . " - $count records\n";
    }
    echo "\n";
}

if (!empty($academicTables)) {
    echo "🎓 ACADEMIC-RELATED TABLES (" . count($academicTables) . "):\n";
    foreach ($academicTables as $t) {
        $stmt = $pdo->query("SELECT COUNT(*) FROM `$t`");
        $count = $stmt->fetch(PDO::FETCH_COLUMN);
        echo "  • " . str_pad($t, 35) . " - $count records\n";
    }
    echo "\n";
}

if (!empty($otherTables)) {
    echo "🔧 OTHER TABLES (" . count($otherTables) . "):\n";
    $sorted = array_slice($otherTables, 0, 20);
    foreach ($sorted as $t) {
        $stmt = $pdo->query("SELECT COUNT(*) FROM `$t`");
        $count = $stmt->fetch(PDO::FETCH_COLUMN);
        echo "  • " . str_pad($t, 35) . " - $count records\n";
    }
    if (count($otherTables) > 20) {
        echo "  ... and " . (count($otherTables) - 20) . " more tables\n";
    }
    echo "\n";
}

?>
