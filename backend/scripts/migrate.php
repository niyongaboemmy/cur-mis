<?php
// scripts/migrate.php
// ─────────────────────────────────────────────────────────────────────────
// Applies every *.sql file in backend/database/migrations/ in filename
// order, recording each in a `schema_migrations` table so reruns are no-ops.
//
// Usage:
//   php scripts/migrate.php           # apply pending migrations
//   php scripts/migrate.php --status  # show applied vs pending, no changes
//   php scripts/migrate.php --force <file.sql>   # re-run a specific file
// ─────────────────────────────────────────────────────────────────────────

require __DIR__ . '/../vendor/autoload.php';
if (file_exists(__DIR__ . '/../.env')) {
    (Dotenv\Dotenv::createImmutable(__DIR__ . '/..'))->load();
}

$dbHost = $_ENV['DB_HOST']     ?? '127.0.0.1';
$dbPort = $_ENV['DB_PORT']     ?? 8889;
$dbName = $_ENV['DB_DATABASE'] ?? 'cur_mis';
$dbUser = $_ENV['DB_USERNAME'] ?? 'root';
$dbPass = $_ENV['DB_PASSWORD'] ?? 'root';

$args        = $argv ?? [];
$statusOnly  = in_array('--status', $args, true);
$forceIndex  = array_search('--force', $args, true);
$forceFile   = $forceIndex !== false && isset($args[$forceIndex + 1]) ? $args[$forceIndex + 1] : null;

$pdo = new PDO(
    "mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4",
    $dbUser, $dbPass,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

// Migrations ledger — single source of truth for what's been applied.
$pdo->exec("
    CREATE TABLE IF NOT EXISTS `schema_migrations` (
        `filename`   VARCHAR(255) NOT NULL,
        `applied_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`filename`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");

$migrationsDir = realpath(__DIR__ . '/../database/migrations');
$files = glob($migrationsDir . '/*.sql') ?: [];
sort($files, SORT_STRING);

$applied = [];
foreach ($pdo->query("SELECT filename FROM `schema_migrations`") as $row) {
    $applied[$row['filename']] = true;
}

if ($statusOnly) {
    foreach ($files as $f) {
        $name   = basename($f);
        $status = isset($applied[$name]) ? 'applied' : 'pending';
        echo str_pad($status, 8) . " $name\n";
    }
    exit(0);
}

$ran = 0;
foreach ($files as $f) {
    $name = basename($f);
    $isForced = $forceFile !== null && $name === $forceFile;
    if (isset($applied[$name]) && !$isForced) continue;

    echo "→ $name … ";
    $sql = file_get_contents($f);
    if ($sql === false || trim($sql) === '') {
        echo "skip (empty)\n";
        continue;
    }

    try {
        // Many of our migrations use PREPARE/EXECUTE conditionals that need
        // to run as one batch. PDO::exec handles multi-statement strings
        // returned from MySQL's text protocol natively.
        $pdo->exec($sql);
        $stmt = $pdo->prepare("REPLACE INTO `schema_migrations` (filename, applied_at) VALUES (?, NOW())");
        $stmt->execute([$name]);
        echo "OK\n";
        $ran++;
    } catch (\PDOException $e) {
        echo "FAILED\n  " . $e->getMessage() . "\n";
        exit(1);
    }
}

if ($ran === 0) {
    echo "Nothing to apply. Run with --status to see the ledger.\n";
} else {
    echo "Applied $ran migration(s).\n";
}
