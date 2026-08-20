<?php

declare(strict_types=1);

/**
 * scripts/reconcile_module_marks.php
 * ─────────────────────────────────────────────────────────────────────────
 * Re-links "orphan" module_marks rows to the right student so their marks
 * show on the student profile / transcript.
 *
 * Why: marks are keyed by `student_regnumber`. A chunk of imported marks were
 * saved under the WRONG identifier — a typo'd regnumber, a different
 * punctuation, a name, or an alternate id — so they don't match any
 * `student.regnumber` and never appear on the profile page.
 *
 * This script remaps an orphan key to a student's canonical regnumber, but
 * ONLY when the match is unambiguous:
 *   • alnum match  — same regnumber ignoring case + non-alphanumeric chars,
 *                    and exactly ONE student normalises to it (safe).
 *   • name match   — UPPER(TRIM(fname lname)) matches exactly ONE student
 *                    (riskier; opt-in via --match-names).
 *
 * Ambiguous matches (a normalised key shared by >1 student) and unrecoverable
 * keys (missing letters, unknown ids) are LEFT ALONE — guessing would attach
 * the wrong marks to a student. Unmatched keys can be exported for the
 * registry to correct at source.
 *
 * The unique key uniq_marks(module_id, student_regnumber, academic_term_id)
 * is respected: a remap that would duplicate an existing mark is skipped
 * (UPDATE IGNORE), leaving the original row in place.
 *
 * Idempotent: once a key matches a real student it's no longer an orphan, so
 * re-running converges. Safe to run on any database.
 *
 * Usage:
 *   php scripts/reconcile_module_marks.php --dry-run
 *   php scripts/reconcile_module_marks.php
 *   php scripts/reconcile_module_marks.php --match-names
 *   php scripts/reconcile_module_marks.php --report=/tmp/unmatched_marks.csv
 * ─────────────────────────────────────────────────────────────────────────
 */

require __DIR__ . '/../vendor/autoload.php';
if (file_exists(__DIR__ . '/../.env')) {
    (Dotenv\Dotenv::createImmutable(__DIR__ . '/..'))->load();
}

$args       = $argv ?? [];
$dryRun     = in_array('--dry-run', $args, true);
$matchNames = in_array('--match-names', $args, true);
$reportFile = null;
foreach ($args as $a) { if (preg_match('/^--report=(.+)$/', $a, $m)) $reportFile = $m[1]; }

$pdo = new PDO(
    sprintf("mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4",
        $_ENV['DB_HOST'] ?? '127.0.0.1', $_ENV['DB_PORT'] ?? 8889, $_ENV['DB_DATABASE'] ?? 'cur_mis'),
    $_ENV['DB_USERNAME'] ?? 'root', $_ENV['DB_PASSWORD'] ?? 'root',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$alnum = static fn (string $s): string => strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $s));

echo "── module_marks reconciliation ──────────────────────────────────────\n";
echo "Mode: " . ($dryRun ? 'DRY RUN' : 'LIVE') . " · name-matching: " . ($matchNames ? 'on' : 'off') . "\n\n";

// Build student lookup maps (only 1:1 buckets are usable).
$byAlnum = [];   // alnum(regnumber) => [regnumber, ...]
$byName  = [];   // UPPER(TRIM(fname lname)) => [regnumber, ...]
foreach ($pdo->query("SELECT regnumber, fname, lname FROM student WHERE regnumber IS NOT NULL AND regnumber<>''") as $r) {
    $reg = (string) $r['regnumber'];
    $byAlnum[$alnum($reg)][] = $reg;
    $nm = strtoupper(trim(($r['fname'] ?? '') . ' ' . ($r['lname'] ?? '')));
    if ($nm !== '') $byName[$nm][] = $reg;
}

// Orphan distinct keys = mark regnumbers with no exact student.
$orphans = $pdo->query(
    "SELECT mm.student_regnumber rn, COUNT(*) c
     FROM module_marks mm
     LEFT JOIN student s ON s.regnumber = mm.student_regnumber
     WHERE s.id IS NULL
     GROUP BY mm.student_regnumber"
)->fetchAll(PDO::FETCH_ASSOC);

$plan = [];       // orphanKey => canonical
$viaAlnum = $viaName = 0;
$unmatched = [];

foreach ($orphans as $o) {
    $key = (string) $o['rn'];
    $a = $alnum($key);
    if ($a !== '' && isset($byAlnum[$a]) && count(array_unique($byAlnum[$a])) === 1) {
        $canon = $byAlnum[$a][0];
        if ($canon !== $key) { $plan[$key] = $canon; $viaAlnum++; }
        continue;
    }
    if ($matchNames) {
        $nm = strtoupper(trim($key));
        if (isset($byName[$nm]) && count(array_unique($byName[$nm])) === 1) {
            $plan[$key] = $byName[$nm][0]; $viaName++; continue;
        }
    }
    $unmatched[] = [$key, (int) $o['c']];
}

$orphanRows = array_sum(array_map(fn ($o) => (int) $o['c'], $orphans));
echo "Orphan keys: " . count($orphans) . " ({$orphanRows} mark rows)\n";
echo "  resolvable by alnum (1:1): {$viaAlnum}\n";
echo "  resolvable by name  (1:1): {$viaName}\n";
echo "  unmatched (left as-is):    " . count($unmatched) . "\n\n";

if ($reportFile && $unmatched) {
    $fh = fopen($reportFile, 'w');
    fputcsv($fh, ['orphan_regnumber', 'mark_rows']);
    foreach ($unmatched as $u) fputcsv($fh, $u);
    fclose($fh);
    echo "Unmatched keys written to {$reportFile}\n\n";
}

if ($dryRun) {
    echo "Sample remaps (first 12):\n";
    $i = 0;
    foreach ($plan as $k => $v) { echo "  [{$k}] -> [{$v}]\n"; if (++$i >= 12) break; }
    echo "\n(dry run — nothing written)\n";
    return;
}

// Apply. UPDATE IGNORE skips rows that would duplicate an existing mark.
$moved = 0; $keysDone = 0;
$stmt = $pdo->prepare("UPDATE IGNORE module_marks SET student_regnumber = ? WHERE student_regnumber = ?");
$pdo->beginTransaction();
foreach ($plan as $orphanKey => $canon) {
    $stmt->execute([$canon, $orphanKey]);
    $moved += $stmt->rowCount();
    $keysDone++;
}
$pdo->commit();

// Recompute coverage.
$studentsWith = $pdo->query("SELECT COUNT(DISTINCT s.id) FROM student s JOIN module_marks mm ON mm.student_regnumber = s.regnumber")->fetchColumn();
$total = $pdo->query("SELECT COUNT(*) FROM student")->fetchColumn();

echo "Remapped {$keysDone} keys · {$moved} mark rows updated.\n";
echo "Students with visible marks now: {$studentsWith} / {$total}\n";
echo "Done.\n";
