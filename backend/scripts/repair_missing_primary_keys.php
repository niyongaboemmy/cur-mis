<?php

declare(strict_types=1);

/**
 * Restore PRIMARY KEY + AUTO_INCREMENT on tables that lost them.
 *
 * WHY THIS EXISTS
 * ---------------
 * Some database copies (typically a dump imported twice, or one taken without
 * key definitions) have tables whose `id` column is neither a primary key nor
 * auto-incrementing. Every INSERT then lands on id 0, and because there is no
 * uniqueness constraint the row is accepted. Observed consequences:
 *
 *   - New user accounts all receive id 0 and authenticate as ONE ANOTHER.
 *   - A staff login account cannot be provisioned safely, so HR staff creation
 *     refuses to create one.
 *   - Creating a second employee fails outright once id 0 is taken.
 *
 * WHAT IT DOES
 * ------------
 *   1. Reports which tables are affected.
 *   2. Removes rows that are byte-for-byte duplicates of another row with the
 *      same id (the signature of a double import). Rows that share an id but
 *      DIFFER in any column are never touched — the script stops instead,
 *      because choosing between them is a judgement call, not a repair.
 *   3. Adds PRIMARY KEY + AUTO_INCREMENT, seeded above the current max id.
 *
 * USAGE
 * -----
 *   php backend/scripts/repair_missing_primary_keys.php            # dry run
 *   php backend/scripts/repair_missing_primary_keys.php --apply    # execute
 *
 * TAKE A BACKUP FIRST:
 *   mysqldump -u root -p <database> > backup.sql
 */

$root = dirname(__DIR__);
require $root . '/vendor/autoload.php';
Dotenv\Dotenv::createImmutable($root)->load();

$apply = in_array('--apply', $argv, true);

/** table => primary key column */
$TARGETS = [
    'users'         => 'id',
    'employees'     => 'employee_id',
    'notifications' => 'id',
    'fee_fines'     => 'id',
    'fee_invoices'  => 'id',
];

$dsn = sprintf(
    'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
    $_ENV['DB_HOST'], $_ENV['DB_PORT'] ?? 3306, $_ENV['DB_DATABASE']
);
$pdo = new PDO($dsn, $_ENV['DB_USERNAME'], $_ENV['DB_PASSWORD'], [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$schema = (string)$_ENV['DB_DATABASE'];

echo $apply
    ? "MODE: APPLY — the database WILL be modified.\n\n"
    : "MODE: DRY RUN — nothing will be changed. Re-run with --apply to execute.\n\n";
echo "Database: {$schema}\n\n";

$plan     = [];
$blocked  = [];

foreach ($TARGETS as $table => $pk) {
    $exists = $pdo->prepare(
        "SELECT COUNT(*) c FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?"
    );
    $exists->execute([$schema, $table]);
    if ((int)$exists->fetch()['c'] === 0) {
        printf("  %-14s SKIP  (table not present)\n", $table);
        continue;
    }

    $col = $pdo->prepare(
        "SELECT COLUMN_KEY, EXTRA FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?"
    );
    $col->execute([$schema, $table, $pk]);
    $info = $col->fetch();
    if (!$info) {
        printf("  %-14s SKIP  (no `%s` column)\n", $table, $pk);
        continue;
    }

    $hasPk   = $info['COLUMN_KEY'] === 'PRI';
    $hasAuto = str_contains(strtolower((string)$info['EXTRA']), 'auto_increment');
    if ($hasPk && $hasAuto) {
        printf("  %-14s OK    (primary key + auto_increment present)\n", $table);
        continue;
    }

    // Compare every column so "duplicate" means genuinely identical.
    $cols = $pdo->query("SHOW COLUMNS FROM `{$table}`")->fetchAll();
    $sig  = implode(',', array_map(
        fn(array $c): string => "IFNULL(CAST(`{$c['Field']}` AS CHAR),'~NULL~')",
        $cols
    ));

    $groups = $pdo->query(
        "SELECT `{$pk}` AS pk, COUNT(*) AS rows_, COUNT(DISTINCT CONCAT_WS('|', {$sig})) AS variants
         FROM `{$table}` GROUP BY `{$pk}` HAVING rows_ > 1"
    )->fetchAll();

    $identical = array_filter($groups, fn(array $g): bool => (int)$g['variants'] === 1);
    $differing = array_filter($groups, fn(array $g): bool => (int)$g['variants'] > 1);

    $extraRows = 0;
    foreach ($identical as $g) {
        $extraRows += (int)$g['rows_'] - 1;
    }

    printf(
        "  %-14s NEEDS REPAIR  (pk=%s auto_increment=%s, %d duplicate id group(s), %d redundant row(s))\n",
        $table,
        $hasPk ? 'yes' : 'no',
        $hasAuto ? 'yes' : 'no',
        count($groups),
        $extraRows
    );

    if ($differing) {
        $ids = implode(', ', array_map(fn(array $g) => (string)$g['pk'], array_slice($differing, 0, 10)));
        printf("                 STOP: %d id(s) are shared by rows with DIFFERENT content (%s).\n",
            count($differing), $ids);
        printf("                 These must be resolved by hand — the script will not guess.\n");
        $blocked[] = $table;
        continue;
    }

    $plan[$table] = ['pk' => $pk, 'extraRows' => $extraRows, 'hasPk' => $hasPk];
}

if ($blocked) {
    echo "\nBlocked: " . implode(', ', $blocked) . " — resolve the conflicting rows first.\n";
}

if (!$plan) {
    echo "\nNothing to repair.\n";
    exit(0);
}

echo "\nPlanned changes:\n";
foreach ($plan as $table => $p) {
    if ($p['extraRows'] > 0) {
        echo "  {$table}: delete {$p['extraRows']} exact-duplicate row(s)\n";
    }
    echo $p['hasPk']
        ? "  {$table}: ADD AUTO_INCREMENT to `{$p['pk']}` (primary key already present)\n"
        : "  {$table}: ADD PRIMARY KEY (`{$p['pk']}`) + AUTO_INCREMENT\n";
}

if (!$apply) {
    echo "\nDry run complete. Re-run with --apply to execute (take a backup first).\n";
    exit(0);
}

echo "\nApplying…\n";
foreach ($plan as $table => $p) {
    $pk = $p['pk'];
    $pdo->beginTransaction();
    try {
        if ($p['extraRows'] > 0) {
            // Keep the lowest internal row per id, drop the rest. Safe only
            // because every row in these groups was verified identical above.
            $pdo->exec("DELETE t1 FROM `{$table}` t1
                        JOIN `{$table}` t2
                          ON t1.`{$pk}` = t2.`{$pk}`
                         AND t1.ROWID__ > t2.ROWID__");
        }
        $pdo->commit();
    } catch (\Throwable $e) {
        $pdo->rollBack();
        // MySQL has no ROWID, so fall back to a rebuild via a temporary table.
        echo "  {$table}: de-duplicating via table rebuild…\n";
        $pdo->exec("CREATE TABLE `{$table}__dedup` LIKE `{$table}`");
        $pdo->exec("INSERT INTO `{$table}__dedup` SELECT DISTINCT * FROM `{$table}`");
        $pdo->exec("DROP TABLE `{$table}`");
        $pdo->exec("RENAME TABLE `{$table}__dedup` TO `{$table}`");
    }

    $max = (int)$pdo->query("SELECT COALESCE(MAX(`{$pk}`),0) m FROM `{$table}`")->fetch()['m'];

    // Rows sitting on id 0 would collide with the first generated id.
    $zero = (int)$pdo->query("SELECT COUNT(*) c FROM `{$table}` WHERE `{$pk}` = 0")->fetch()['c'];
    if ($zero > 0) {
        $pdo->exec("UPDATE `{$table}` SET `{$pk}` = " . ($max + 1) . " WHERE `{$pk}` = 0");
        echo "  {$table}: moved {$zero} row(s) off id 0 to id " . ($max + 1) . "\n";
        $max++;
    }

    $type = $pdo->query("SHOW COLUMNS FROM `{$table}` LIKE " . $pdo->quote($pk))->fetch()['Type'];
    $pdo->exec("ALTER TABLE `{$table}` MODIFY `{$pk}` {$type} NOT NULL");
    // Re-read rather than trusting the earlier snapshot: a table rebuild above
    // may already have carried the key over.
    $nowHasPk = $pdo->query(
        "SELECT COUNT(*) c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = " . $pdo->quote($schema) . "
           AND TABLE_NAME = "   . $pdo->quote($table) . "
           AND COLUMN_NAME = "  . $pdo->quote($pk) . "
           AND COLUMN_KEY = 'PRI'"
    )->fetch()['c'] > 0;

    if (!$nowHasPk) {
        $pdo->exec("ALTER TABLE `{$table}` ADD PRIMARY KEY (`{$pk}`)");
    }
    $pdo->exec("ALTER TABLE `{$table}` MODIFY `{$pk}` {$type} NOT NULL AUTO_INCREMENT");
    $pdo->exec("ALTER TABLE `{$table}` AUTO_INCREMENT = " . ($max + 1));

    echo "  {$table}: repaired (next id = " . ($max + 1) . ")\n";
}

echo "\nDone. Verify with:  php backend/scripts/repair_missing_primary_keys.php\n";
