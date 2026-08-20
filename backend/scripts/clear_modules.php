<?php
/**
 * Wipe ALL module-related rows so the user can upload a fresh dataset.
 *
 * Order matters: junction tables go before `modules` to satisfy FK
 * constraints; foreign-key checks are disabled briefly because TRUNCATE
 * doesn't honour FKs even when rows exist.
 *
 * Usage:  php backend/scripts/clear_modules.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->safeLoad();

$host = $_ENV['DB_HOST']     ?? '127.0.0.1';
$port = $_ENV['DB_PORT']     ?? '8889';
$db   = $_ENV['DB_DATABASE'] ?? 'curac_save';
$user = $_ENV['DB_USERNAME'] ?? 'root';
$pass = $_ENV['DB_PASSWORD'] ?? 'root';

$pdo = new PDO("mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

echo "Connected to {$db} on {$host}:{$port}\n";

$tables = ['module_offerings', 'module_programs', 'module_levels', 'modules'];

$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
foreach ($tables as $t) {
    try {
        $count = (int)$pdo->query("SELECT COUNT(*) AS c FROM `{$t}`")->fetchColumn();
        $pdo->exec("TRUNCATE TABLE `{$t}`");
        echo "  · {$t}: cleared {$count} row(s)\n";
    } catch (Throwable $e) {
        echo "  · {$t}: skipped — {$e->getMessage()}\n";
    }
}
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

echo "\nAll module-related tables cleared.\n";
