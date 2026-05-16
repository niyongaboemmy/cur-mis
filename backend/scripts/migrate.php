<?php
// scripts/migrate.php
// ─────────────────────────────────────────────────────────────────────────
// Applies every *.sql file in backend/database/migrations/ in filename
// order, recording each in a `schema_migrations` table so reruns are no-ops.
//
// "Already exists" errors (duplicate column / table / key) are treated as
// success — most of our migrations are idempotent but a handful pre-date
// the INFORMATION_SCHEMA guard convention; this lets them no-op safely on
// envs where the column already exists.
//
// Usage:
//   php scripts/migrate.php                    # apply pending migrations
//   php scripts/migrate.php --status           # show applied vs pending
//   php scripts/migrate.php --force <file>     # re-run a specific file
//   php scripts/migrate.php --baseline         # mark all current files as
//                                              # applied without running them
//                                              # (use on an existing DB the
//                                              # first time the runner is
//                                              # installed)
//   php scripts/migrate.php --reset-ledger     # drop schema_migrations
//                                              # (rarely needed)
//   php scripts/migrate.php --strict           # fail on any error including
//                                              # "already exists" duplicates
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

$args         = $argv ?? [];
$statusOnly   = in_array('--status',        $args, true);
$baseline     = in_array('--baseline',      $args, true);
$resetLedger  = in_array('--reset-ledger',  $args, true);
$strict       = in_array('--strict',        $args, true);
$forceIndex   = array_search('--force',     $args, true);
$forceFile    = $forceIndex !== false && isset($args[$forceIndex + 1]) ? $args[$forceIndex + 1] : null;

// MySQL error codes that mean "this DDL change was already applied".
// 1050 — Table already exists
// 1060 — Duplicate column name
// 1061 — Duplicate key name
// 1068 — Multiple primary key defined
// 1091 — Can't DROP; check that column/key exists
// 1146 — Table doesn't exist (e.g. DROP TABLE IF EXISTS path on legacy)
$idempotentCodes = [1050, 1060, 1061, 1068, 1091];

$pdo = new PDO(
    "mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4",
    $dbUser, $dbPass,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

if ($resetLedger) {
    $pdo->exec("DROP TABLE IF EXISTS `schema_migrations`");
    echo "Dropped schema_migrations.\n";
}

// Migrations ledger — single source of truth for what's been applied.
$pdo->exec("
    CREATE TABLE IF NOT EXISTS `schema_migrations` (
        `filename`   VARCHAR(255) NOT NULL,
        `applied_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `status`     ENUM('applied','baselined','skipped') NOT NULL DEFAULT 'applied',
        PRIMARY KEY (`filename`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");
// Older runner versions didn't have `status` — add it idempotently.
try {
    $pdo->exec("ALTER TABLE `schema_migrations`
                ADD COLUMN `status` ENUM('applied','baselined','skipped') NOT NULL DEFAULT 'applied'");
} catch (\PDOException $e) { /* already there */ }

$migrationsDir = realpath(__DIR__ . '/../database/migrations');
$files = glob($migrationsDir . '/*.sql') ?: [];
sort($files, SORT_STRING);

$applied = [];
foreach ($pdo->query("SELECT filename, status FROM `schema_migrations`") as $row) {
    $applied[$row['filename']] = $row['status'];
}

if ($baseline) {
    $stmt = $pdo->prepare(
        "INSERT INTO `schema_migrations` (filename, status, applied_at) VALUES (?, 'baselined', NOW())
         ON DUPLICATE KEY UPDATE applied_at = applied_at"
    );
    $added = 0;
    foreach ($files as $f) {
        $name = basename($f);
        if (!isset($applied[$name])) {
            $stmt->execute([$name]);
            $added++;
        }
    }
    echo "Baselined $added migration(s) as already-applied.\n";
    exit(0);
}

if ($statusOnly) {
    foreach ($files as $f) {
        $name   = basename($f);
        $status = $applied[$name] ?? 'pending';
        echo str_pad($status, 10) . " $name\n";
    }
    exit(0);
}

$ran = 0; $skipped = 0; $errors = 0;
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
        runMigrationSql($pdo, $sql);
        $pdo->prepare("REPLACE INTO `schema_migrations` (filename, status, applied_at) VALUES (?, 'applied', NOW())")
            ->execute([$name]);
        echo "OK\n";
        $ran++;
    } catch (\PDOException $e) {
        // Strip away PDO's prefix to get the raw MySQL code.
        $code = (int)($e->errorInfo[1] ?? 0);
        if (!$strict && in_array($code, $idempotentCodes, true)) {
            $pdo->prepare("REPLACE INTO `schema_migrations` (filename, status, applied_at) VALUES (?, 'skipped', NOW())")
                ->execute([$name]);
            echo "SKIPPED (idempotent — MySQL $code: already exists)\n";
            $skipped++;
        } else {
            echo "FAILED\n  " . $e->getMessage() . "\n";
            $errors++;
            if ($strict) exit(1);
        }
    }
}

echo "\nDone. Applied: $ran  Skipped: $skipped  Errors: $errors\n";
exit($errors > 0 ? 1 : 0);

// ─────────────────────────────────────────────────────────────────────────
// Multi-statement execution.
//
// PDO::exec() can run a multi-statement string against MySQL, but if any
// statement returns rows (a SELECT, a stray "SELECT 1" sentinel, etc.)
// PDO leaves the result set hanging and the NEXT migration will fail with
// "Cannot execute queries while there are pending result sets". We avoid
// the foot-gun by splitting the file into individual statements and
// draining cursors between them.
//
// Splitter is intentionally minimal — handles the SQL flavour our
// migrations use (SET, ALTER, CREATE, INSERT, UPDATE, PREPARE/EXECUTE/
// DEALLOCATE). It correctly ignores semicolons inside single-quoted
// strings and `-- line comments`. No stored procedures = no need for a
// DELIMITER-aware splitter.
// ─────────────────────────────────────────────────────────────────────────
function runMigrationSql(\PDO $pdo, string $sql): void
{
    foreach (splitSqlStatements($sql) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '') continue;
        $cur = $pdo->query($stmt);
        if ($cur instanceof \PDOStatement) {
            while ($cur->nextRowset()) {
                // drain any extra result sets
            }
            $cur->closeCursor();
        }
    }
}

function splitSqlStatements(string $sql): array
{
    $out = [];
    $buf = '';
    $len = strlen($sql);
    $inSingleQuote = false;
    $inDoubleQuote = false;
    $inLineComment = false;
    $inBlockComment = false;

    for ($i = 0; $i < $len; $i++) {
        $ch = $sql[$i];
        $next = $i + 1 < $len ? $sql[$i + 1] : '';

        if ($inLineComment) {
            $buf .= $ch;
            if ($ch === "\n") $inLineComment = false;
            continue;
        }
        if ($inBlockComment) {
            $buf .= $ch;
            if ($ch === '*' && $next === '/') {
                $buf .= $next;
                $i++;
                $inBlockComment = false;
            }
            continue;
        }
        if (!$inSingleQuote && !$inDoubleQuote) {
            if ($ch === '-' && $next === '-') { $inLineComment = true; $buf .= $ch; continue; }
            if ($ch === '/' && $next === '*') { $inBlockComment = true; $buf .= $ch; continue; }
        }
        if ($ch === "'" && !$inDoubleQuote) {
            // Handle escaped '' inside single-quoted string
            if ($inSingleQuote && $next === "'") {
                $buf .= $ch . $next;
                $i++;
                continue;
            }
            $inSingleQuote = !$inSingleQuote;
            $buf .= $ch;
            continue;
        }
        if ($ch === '"' && !$inSingleQuote) {
            $inDoubleQuote = !$inDoubleQuote;
            $buf .= $ch;
            continue;
        }
        if ($ch === ';' && !$inSingleQuote && !$inDoubleQuote) {
            $out[] = $buf;
            $buf = '';
            continue;
        }
        $buf .= $ch;
    }
    if (trim($buf) !== '') $out[] = $buf;
    return $out;
}
