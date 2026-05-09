<?php
/**
 * Remove exact-duplicate rows from `academic_terms`. Two rows are
 * considered duplicates when they share academic_year_id + label +
 * start_date + end_date. The lowest-id row in each group is kept; any
 * `module_schedules` rows pointing at the deleted ones are first
 * repointed to the kept id, so referential integrity stays intact.
 *
 * Usage:
 *   php backend/scripts/dedupe_academic_terms.php           # apply
 *   php backend/scripts/dedupe_academic_terms.php --dry-run # preview
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

$pdo = new PDO("mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

echo "Connected to {$db} on {$host}:{$port}\n";
echo $dryRun ? "(DRY RUN — no changes will be written)\n\n" : "\n";

// Find groups of duplicates.
$groups = $pdo->query(
    "SELECT
        academic_year_id, label, start_date, end_date,
        COUNT(*) AS dup_count,
        GROUP_CONCAT(id ORDER BY id ASC) AS ids
     FROM `academic_terms`
     GROUP BY academic_year_id, label, start_date, end_date
     HAVING COUNT(*) > 1
     ORDER BY academic_year_id, label"
)->fetchAll(PDO::FETCH_ASSOC);

if (!$groups) {
    echo "No duplicate academic_terms found — table is already clean.\n";
    exit(0);
}

$totalDeleted   = 0;
$totalRepointed = 0;

// Check whether module_schedules even exists (some installs may not
// have it yet).
$hasSchedules = (bool)$pdo->query(
    "SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'module_schedules'
     LIMIT 1"
)->fetchColumn();

foreach ($groups as $g) {
    $ids = array_map('intval', explode(',', $g['ids']));
    $keep = array_shift($ids);
    $drop = $ids;
    $year = $g['academic_year_id'];

    echo "Group: '{$g['label']}' year={$year} {$g['start_date']} → {$g['end_date']}\n";
    echo "  · keep id={$keep}\n";
    foreach ($drop as $id) echo "  · drop id={$id}\n";

    if ($dryRun) continue;

    if ($hasSchedules) {
        $ph = implode(',', array_fill(0, count($drop), '?'));
        $bindings = array_merge([$keep], $drop);
        $repointed = $pdo->prepare(
            "UPDATE `module_schedules`
             SET `academic_term_id` = ?
             WHERE `academic_term_id` IN ($ph)"
        );
        $repointed->execute($bindings);
        $totalRepointed += $repointed->rowCount();
    }

    $ph = implode(',', array_fill(0, count($drop), '?'));
    $del = $pdo->prepare("DELETE FROM `academic_terms` WHERE id IN ($ph)");
    $del->execute($drop);
    $totalDeleted += $del->rowCount();
}

echo "\nDone. {$totalDeleted} duplicate term(s) deleted"
   . ($hasSchedules ? ", {$totalRepointed} module_schedules row(s) repointed" : '')
   . ($dryRun ? ' (dry run — nothing written).' : '.') . "\n";
