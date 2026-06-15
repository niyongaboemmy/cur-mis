<?php
// scripts/migrate.php — CLI migration runner
// ─────────────────────────────────────────────────────────────────────────
// Applies every *.sql file in backend/database/migrations/ in filename
// order. Core logic lives in App\Services\MigrationService so the same
// code runs both here and via the POST /api/deploy/migrate endpoint.
//
// Usage:
//   php scripts/migrate.php                    # apply pending migrations
//   php scripts/migrate.php --status           # show applied vs pending
//   php scripts/migrate.php --force <file>     # re-run a specific file
//   php scripts/migrate.php --baseline         # mark all current as applied
//                                              # without running them (use on
//                                              # an existing DB the first time)
//   php scripts/migrate.php --reset-ledger     # drop schema_migrations table
//   php scripts/migrate.php --strict           # fail on any SQL error
// ─────────────────────────────────────────────────────────────────────────

define('BASE_PATH', dirname(__DIR__));

require BASE_PATH . '/vendor/autoload.php';

if (file_exists(BASE_PATH . '/.env')) {
    (Dotenv\Dotenv::createImmutable(BASE_PATH))->load();
}

$service = new App\Services\MigrationService();

$args        = $argv ?? [];
$statusOnly  = in_array('--status',       $args, true);
$baseline    = in_array('--baseline',     $args, true);
$resetLedger = in_array('--reset-ledger', $args, true);
$strict      = in_array('--strict',       $args, true);
$forceIdx    = array_search('--force',    $args, true);
$forceFile   = ($forceIdx !== false && isset($args[$forceIdx + 1])) ? $args[$forceIdx + 1] : null;

// ── Reset ledger ──────────────────────────────────────────────────────────────
if ($resetLedger) {
    $pdo = (new ReflectionProperty($service, 'pdo'))->getValue($service);
    $pdo->exec("DROP TABLE IF EXISTS `schema_migrations`");
    echo "Dropped schema_migrations.\n";
    exit(0);
}

$service->ensureLedger();

// ── Baseline (mark all as applied without running) ───────────────────────────
if ($baseline) {
    $applied = $service->appliedMap();
    $pdo     = (new ReflectionProperty(App\Services\MigrationService::class, 'pdo'))->getValue($service);
    $stmt    = $pdo->prepare(
        "INSERT INTO `schema_migrations` (filename, status, applied_at) VALUES (?, 'baselined', NOW())
         ON DUPLICATE KEY UPDATE applied_at = applied_at"
    );
    $added = 0;
    foreach ($service->allFiles() as $f) {
        $name = basename($f);
        if (!isset($applied[$name])) { $stmt->execute([$name]); $added++; }
    }
    echo "Baselined $added migration(s) as already-applied.\n";
    exit(0);
}

// ── Status ────────────────────────────────────────────────────────────────────
if ($statusOnly) {
    foreach ($service->status() as $m) {
        echo str_pad($m['status'], 10) . " {$m['file']}\n";
    }
    exit(0);
}

// ── Force re-run a specific file ──────────────────────────────────────────────
if ($forceFile !== null) {
    // Remove from ledger so runPending() picks it up again.
    $pdo = (new ReflectionProperty(App\Services\MigrationService::class, 'pdo'))->getValue($service);
    $pdo->prepare("DELETE FROM `schema_migrations` WHERE filename = ?")->execute([$forceFile]);
    echo "Removed '$forceFile' from ledger — will re-run.\n";
}

// ── Apply pending ─────────────────────────────────────────────────────────────
$results = $service->runPending($strict);

foreach ($results['ran']     as $f) echo "→ $f … OK\n";
foreach ($results['skipped'] as $f) echo "→ $f … SKIPPED\n";
foreach ($results['errors']  as $f) echo "→ $f … FAILED\n";

echo "\nDone. Applied: " . count($results['ran'])
    . "  Skipped: " . count($results['skipped'])
    . "  Errors: "  . count($results['errors']) . "\n";

exit(count($results['errors']) > 0 ? 1 : 0);
