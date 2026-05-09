<?php

/**
 * One-off data backfill: assign `<fac_code>.<seq>` codes to every
 * department that doesn't already have a `dep_code`. Sequence numbers
 * are per-faculty and account for existing codes that already match the
 * pattern, so re-runs are safe (idempotent).
 *
 * Usage:
 *   php backend/scripts/generate_department_codes.php           # apply
 *   php backend/scripts/generate_department_codes.php --dry-run # preview
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

// Pull every faculty that has a usable fac_code.
$faculties = $pdo->query(
    "SELECT fac_id, fac_code
     FROM `faculty`
     WHERE fac_code IS NOT NULL AND fac_code <> ''
     ORDER BY fac_id"
)->fetchAll(PDO::FETCH_ASSOC);

if (!$faculties) {
    echo "No faculties have a fac_code yet — nothing to assign.\n";
    exit(0);
}

$totalAssigned = 0;
$totalSkipped  = 0;

$update = $dryRun ? null : $pdo->prepare(
    "UPDATE `departements` SET `dep_code` = ? WHERE `dep_id` = ?"
);

foreach ($faculties as $f) {
    $facId   = (int)$f['fac_id'];
    $facCode = trim((string)$f['fac_code']);
    $prefix  = $facCode . '.';

    // All departments for this faculty, oldest first so seq numbers
    // stay stable across re-runs.
    $stmt = $pdo->prepare(
        "SELECT dep_id, dep_name, dep_code
         FROM `departements`
         WHERE fac_id = ?
         ORDER BY dep_id ASC"
    );
    $stmt->execute([$facId]);
    $depts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (!$depts) continue;

    // Existing seqs that already match the pattern — keep those untouched
    // and use the highest as our starting point so new assignments don't
    // collide.
    $usedSeqs = [];
    foreach ($depts as $d) {
        $code = trim((string)($d['dep_code'] ?? ''));
        if (strncmp($code, $prefix, strlen($prefix)) === 0) {
            $tail = substr($code, strlen($prefix));
            if ($tail !== '' && ctype_digit($tail)) {
                $usedSeqs[(int)$tail] = true;
            }
        }
    }
    $nextSeq = $usedSeqs ? (max(array_keys($usedSeqs)) + 1) : 1;

    echo "Faculty fac_id={$facId} fac_code='{$facCode}': "
       . count($depts) . " department(s)\n";

    foreach ($depts as $d) {
        $depId   = (int)$d['dep_id'];
        $current = trim((string)($d['dep_code'] ?? ''));

        if ($current !== '') {
            // Skip — admin-entered or already-assigned. We never overwrite.
            echo "  • dep_id={$depId} '{$d['dep_name']}' — keeping '{$current}'\n";
            $totalSkipped++;
            continue;
        }

        // Find the next free seq that isn't already used by a sibling.
        while (isset($usedSeqs[$nextSeq])) $nextSeq++;
        $assigned = $prefix . $nextSeq;
        $usedSeqs[$nextSeq] = true;
        $nextSeq++;

        echo "  + dep_id={$depId} '{$d['dep_name']}' → '{$assigned}'\n";
        if (!$dryRun && $update) {
            $update->execute([$assigned, $depId]);
        }
        $totalAssigned++;
    }
}

echo "\nDone. {$totalAssigned} assigned, {$totalSkipped} kept as-is"
   . ($dryRun ? ' (dry run — nothing written).' : '.') . "\n";
