<?php
// scripts/seed.php — CLI seed runner (local dev DB)
// ─────────────────────────────────────────────────────────────────────────
// Runs exactly ONE named seeder against the DB configured in backend/.env.
// Core logic lives in App\Services\SeederService so the same registry is
// used here and via the POST /api/deploy/seed endpoint (production).
//
// Usage:
//   php scripts/seed.php                # lists available seeders
//   php scripts/seed.php <name>          # runs the named seeder
// ─────────────────────────────────────────────────────────────────────────

define('BASE_PATH', dirname(__DIR__));

require BASE_PATH . '/vendor/autoload.php';

if (file_exists(BASE_PATH . '/.env')) {
    (Dotenv\Dotenv::createImmutable(BASE_PATH))->load();
}

$service = new App\Services\SeederService();
$name    = $argv[1] ?? null;

if ($name === null) {
    echo "Usage: php scripts/seed.php <name>\n\n";
    echo "Available seeders:\n";
    foreach ($service->available() as $n) {
        echo "  - $n\n";
    }
    exit(1);
}

if (!$service->has($name)) {
    echo "Unknown seeder \"$name\".\n\nAvailable seeders:\n";
    foreach ($service->available() as $n) {
        echo "  - $n\n";
    }
    exit(1);
}

try {
    $log = $service->run($name);
    foreach ($log as $line) {
        echo "$line\n";
    }
    echo "\nSeeder \"$name\" completed.\n";
    exit(0);
} catch (\Throwable $e) {
    echo "Seeder \"$name\" failed: " . $e->getMessage() . "\n";
    exit(1);
}
