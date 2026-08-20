<?php

/**
 * One-off data backfill: assign `<dep_code>.<seq>` codes to every program
 * (`options` row) that doesn't already have a `code`. Sequence numbers
 * are per-department and account for existing codes that already match
 * the pattern, so re-runs are safe (idempotent).
 *
 * Usage:
 *   php backend/scripts/generate_option_codes.php           # apply
 *   php backend/scripts/generate_option_codes.php --dry-run # preview
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

$dryRun = in_array('--dry-run', $argv, true);

$dsn = "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4";
$pdo = new PDO($dsn, $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

echo "Connected to {$db} on {$host}:{$port}\n";
echo $dryRun ? "(DRY RUN — no changes will be written)\n\n" : "\n";

$departments = $pdo->query(
    "SELECT dep_id, dep_code
     FROM `departements`
     WHERE dep_code IS NOT NULL AND dep_code <> ''
     ORDER BY dep_id"
)->fetchAll(PDO::FETCH_ASSOC);

if (!$departments) {
    echo "No departments have a dep_code yet — nothing to assign.\n";
    exit(0);
}

$totalAssigned = 0;
$totalSkipped  = 0;

$update = $dryRun ? null : $pdo->prepare(
    "UPDATE `options` SET `code` = ? WHERE `id` = ?"
);

foreach ($departments as $d) {
    $depId   = (int)$d['dep_id'];
    $depCode = trim((string)$d['dep_code']);
    $prefix  = $depCode . '.';

    $stmt = $pdo->prepare(
        "SELECT id, name, code
         FROM `options`
         WHERE department_id = ?
         ORDER BY id ASC"
    );
    $stmt->execute([$depId]);
    $opts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (!$opts) continue;

    $usedSeqs = [];
    foreach ($opts as $o) {
        $code = trim((string)($o['code'] ?? ''));
        if (strncmp($code, $prefix, strlen($prefix)) === 0) {
            $tail = substr($code, strlen($prefix));
            if ($tail !== '' && ctype_digit($tail)) {
                $usedSeqs[(int)$tail] = true;
            }
        }
    }
    $nextSeq = $usedSeqs ? (max(array_keys($usedSeqs)) + 1) : 1;

    echo "Department dep_id={$depId} dep_code='{$depCode}': "
       . count($opts) . " program(s)\n";

    foreach ($opts as $o) {
        $optId   = (int)$o['id'];
        $current = trim((string)($o['code'] ?? ''));

        if ($current !== '') {
            echo "  • id={$optId} '{$o['name']}' — keeping '{$current}'\n";
            $totalSkipped++;
            continue;
        }

        while (isset($usedSeqs[$nextSeq])) $nextSeq++;
        $assigned = $prefix . $nextSeq;
        $usedSeqs[$nextSeq] = true;
        $nextSeq++;

        echo "  + id={$optId} '{$o['name']}' → '{$assigned}'\n";
        if (!$dryRun && $update) {
            $update->execute([$assigned, $optId]);
        }
        $totalAssigned++;
    }
}

echo "\nDone. {$totalAssigned} assigned, {$totalSkipped} kept as-is"
   . ($dryRun ? ' (dry run — nothing written).' : '.') . "\n";
