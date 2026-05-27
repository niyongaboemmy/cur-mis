<?php
// scripts/diagnose_pending_enrolled.php
// ─────────────────────────────────────────────────────────────────────────
// Lists applications stuck in non-terminal states (i.e. not enrolled /
// withdrawn / offer_declined) for applicants who already have a student row
// in `student`. This is the "pending but already admitted" desync described
// in Task 1.6. Pass --fix to update the offending application rows in place.
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

$fix = in_array('--fix', $argv ?? [], true);

$pdo = new PDO(
    "mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4",
    $dbUser, $dbPass,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$rows = $pdo->query("
    SELECT sa.id  AS application_id,
           sa.application_number,
           sa.status,
           sa.email,
           sa.national_id,
           s.id   AS student_id,
           s.regnumber,
           s.email AS student_email,
           ao.id   AS offer_id,
           ao.enrollment_initiated
    FROM student_applications sa
    JOIN student s
      ON (sa.email IS NOT NULL AND s.email = sa.email)
      OR (sa.national_id IS NOT NULL AND sa.national_id <> '' AND s.index_number = sa.national_id)
    LEFT JOIN admission_offers ao ON ao.application_id = sa.id
    WHERE sa.status NOT IN ('enrolled', 'withdrawn', 'offer_declined')
")->fetchAll(PDO::FETCH_ASSOC);

echo "Found " . count($rows) . " desynced application(s).\n";
if (empty($rows)) {
    exit(0);
}

foreach ($rows as $r) {
    printf(
        "  app=%s status=%s student=%s reg=%s offer=%s enrollment_initiated=%s\n",
        $r['application_id'], $r['status'],
        $r['student_id'], $r['regnumber'] ?? '-',
        $r['offer_id'] ?? '-', $r['enrollment_initiated'] ?? '-'
    );
}

if (!$fix) {
    echo "\nRe-run with --fix to mark these applications as enrolled.\n";
    exit(0);
}

$pdo->beginTransaction();
try {
    foreach ($rows as $r) {
        $pdo->prepare("UPDATE student_applications SET status = 'enrolled', updated_at = NOW() WHERE id = ?")
            ->execute([$r['application_id']]);
        if (!empty($r['offer_id'])) {
            $pdo->prepare("UPDATE admission_offers SET enrollment_initiated = 1, student_id = ?, updated_at = NOW() WHERE id = ?")
                ->execute([$r['student_id'], $r['offer_id']]);
        }
    }
    $pdo->commit();
    echo "Repaired " . count($rows) . " application row(s).\n";
} catch (\Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, "Fix failed: " . $e->getMessage() . "\n");
    exit(1);
}
