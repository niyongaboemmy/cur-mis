<?php
/**
 * One-shot runner for the Modules Management migrations.
 *
 * Executes each of the six new SQL files in order. Safe to re-run — every
 * migration is authored to be idempotent (CREATE TABLE IF NOT EXISTS,
 * INSERT … ON DUPLICATE KEY UPDATE, guarded ALTER TABLE).
 *
 *     php backend/scripts/run_modules_migrations.php
 */

require_once __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->safeLoad();

$host = $_ENV['DB_HOST']     ?? '127.0.0.1';
$port = $_ENV['DB_PORT']     ?? '8889';
$db   = $_ENV['DB_DATABASE'] ?? 'curac_save';
$user = $_ENV['DB_USERNAME'] ?? 'root';
$pass = $_ENV['DB_PASSWORD'] ?? 'root';

$dsn = "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4";

try {
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
} catch (PDOException $e) {
    fwrite(STDERR, "DB connection failed: {$e->getMessage()}\n");
    exit(1);
}

$files = [
    __DIR__ . '/../migrations/2024_04_23_012_extend_modules_catalog.sql',
    __DIR__ . '/../migrations/2024_04_23_013_create_module_prerequisites.sql',
    __DIR__ . '/../migrations/2024_04_23_014_create_module_assignments.sql',
    __DIR__ . '/../migrations/2024_04_23_015_create_module_schedules.sql',
    __DIR__ . '/../migrations/2024_04_23_016_create_module_registrations.sql',
    __DIR__ . '/../migrations/2024_04_23_017_seed_modules_permissions.sql',
];

foreach ($files as $file) {
    $name = basename($file);
    echo "→ Running {$name} ...\n";
    $sql = file_get_contents($file);

    // Split into statements on semicolons at end of line. PDO::exec() supports
    // multi-statement, but splitting gives us clearer error reporting when a
    // single statement in a migration fails.
    $statements = array_filter(
        array_map('trim', preg_split('/;\s*\n/', $sql)),
        fn ($s) => $s !== '' && !preg_match('/^\s*--/', $s)
    );

    foreach ($statements as $stmt) {
        try {
            $pdo->exec($stmt);
        } catch (PDOException $e) {
            // Tolerate "already exists" on repeat runs — our migrations are idempotent.
            $msg = $e->getMessage();
            if (str_contains($msg, 'already exists') || str_contains($msg, 'Duplicate key name')) {
                echo "  ↳ skip: {$msg}\n";
                continue;
            }
            fwrite(STDERR, "  ✗ Error in {$name}:\n    {$msg}\n    SQL: " . substr($stmt, 0, 120) . "...\n");
            exit(1);
        }
    }

    echo "  ✓ {$name}\n";
}

echo "\nAll Modules Management migrations applied.\n";
