<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use PDOException;

/**
 * Runs database migrations from database/migrations/*.sql in filename order.
 * Tracks applied files in the `schema_migrations` ledger table so reruns are no-ops.
 * Shared by the CLI script (scripts/migrate.php) and the deploy API endpoint.
 */
class MigrationService
{
    private PDO $pdo;
    private string $migrationsDir;

    // MySQL codes that mean the DDL is already applied, or can't take effect
    // against a schema/data mismatch that isn't this migration's job to fix —
    // treated as a soft skip rather than a fatal error in non-strict mode.
    private const IDEMPOTENT_CODES = [
        1050, // Table already exists
        1060, // Duplicate column name
        1061, // Duplicate key name
        1068, // Multiple primary key defined
        1091, // Can't DROP; column/key doesn't exist
        1215, // Cannot add foreign key constraint (type/charset mismatch, no index on referenced column)
        1823, // Failed to add the foreign key constraint (orphaned rows, incompatible column definitions)
    ];

    public function __construct()
    {
        $host    = $_ENV['DB_HOST']     ?? '127.0.0.1';
        $port    = $_ENV['DB_PORT']     ?? 3306;
        $dbName  = $_ENV['DB_DATABASE'] ?? '';
        $user    = $_ENV['DB_USERNAME'] ?? '';
        $pass    = $_ENV['DB_PASSWORD'] ?? '';

        $this->pdo = new PDO(
            "mysql:host=$host;port=$port;dbname=$dbName;charset=utf8mb4",
            $user,
            $pass,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );

        $this->migrationsDir = defined('BASE_PATH')
            ? BASE_PATH . '/database/migrations'
            : dirname(__DIR__, 2) . '/database/migrations';
    }

    /** Ensures the ledger table exists (idempotent). */
    public function ensureLedger(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS `schema_migrations` (
                `filename`   VARCHAR(255) NOT NULL,
                `applied_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `status`     ENUM('applied','baselined','skipped') NOT NULL DEFAULT 'applied',
                PRIMARY KEY (`filename`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
        // Add `status` column for ledgers created by the old runner (no-op if already there).
        try {
            $this->pdo->exec("ALTER TABLE `schema_migrations`
                ADD COLUMN `status` ENUM('applied','baselined','skipped') NOT NULL DEFAULT 'applied'");
        } catch (PDOException) { /* already present */ }
    }

    /** Returns all .sql files sorted by filename. */
    public function allFiles(): array
    {
        $files = glob($this->migrationsDir . '/*.sql') ?: [];
        sort($files, SORT_STRING);
        return $files;
    }

    /** Returns a map of filename → status for already-recorded migrations. */
    public function appliedMap(): array
    {
        $map = [];
        foreach ($this->pdo->query("SELECT filename, status FROM `schema_migrations`") as $row) {
            $map[$row['filename']] = $row['status'];
        }
        return $map;
    }

    /**
     * Returns status of every migration file.
     * Each entry: ['file' => string, 'status' => 'applied'|'baselined'|'skipped'|'pending']
     */
    public function status(): array
    {
        $this->ensureLedger();
        $applied = $this->appliedMap();
        $result  = [];
        foreach ($this->allFiles() as $f) {
            $name     = basename($f);
            $result[] = ['file' => $name, 'status' => $applied[$name] ?? 'pending'];
        }
        return $result;
    }

    /**
     * Applies all pending migrations.
     * Returns ['ran' => [], 'skipped' => [], 'errors' => []] with filenames.
     */
    public function runPending(bool $strict = false): array
    {
        $this->ensureLedger();
        $applied = $this->appliedMap();

        $ran = $skipped = $errors = [];

        foreach ($this->allFiles() as $f) {
            $name = basename($f);
            if (isset($applied[$name])) {
                continue;
            }

            $sql = file_get_contents($f);
            if ($sql === false || trim($sql) === '') {
                $skipped[] = $name . ' (empty)';
                continue;
            }

            try {
                $this->runSql($sql);
                $this->pdo->prepare(
                    "REPLACE INTO `schema_migrations` (filename, status, applied_at) VALUES (?, 'applied', NOW())"
                )->execute([$name]);
                $ran[] = $name;
            } catch (PDOException $e) {
                $code = (int)($e->errorInfo[1] ?? 0);
                if (!$strict && in_array($code, self::IDEMPOTENT_CODES, true)) {
                    $this->pdo->prepare(
                        "REPLACE INTO `schema_migrations` (filename, status, applied_at) VALUES (?, 'skipped', NOW())"
                    )->execute([$name]);
                    $skipped[] = $name . " (MySQL $code: already applied)";
                } else {
                    $errors[] = $name . ': ' . $e->getMessage();
                    if ($strict) {
                        break;
                    }
                }
            }
        }

        return ['ran' => $ran, 'skipped' => $skipped, 'errors' => $errors];
    }

    /**
     * Marks every currently-pending migration file as "baselined" (applied)
     * WITHOUT running its SQL. For a DB whose schema is already ahead of the
     * ledger — e.g. changes applied manually before this ledger existed.
     * Returns the list of filenames that were newly baselined.
     */
    public function baseline(): array
    {
        $this->ensureLedger();
        $applied = $this->appliedMap();

        $stmt = $this->pdo->prepare(
            "INSERT INTO `schema_migrations` (filename, status, applied_at) VALUES (?, 'baselined', NOW())
             ON DUPLICATE KEY UPDATE applied_at = applied_at"
        );

        $baselined = [];
        foreach ($this->allFiles() as $f) {
            $name = basename($f);
            if (isset($applied[$name])) {
                continue;
            }
            $stmt->execute([$name]);
            $baselined[] = $name;
        }

        return $baselined;
    }

    /** Executes a multi-statement SQL string, draining cursors between statements. */
    private function runSql(string $sql): void
    {
        foreach ($this->splitStatements($sql) as $stmt) {
            $stmt = trim($stmt);
            if ($stmt === '') {
                continue;
            }
            $cur = $this->pdo->query($stmt);
            if ($cur !== false) {
                while ($cur->nextRowset()) {
                    // drain extra result sets to avoid "pending result sets" error
                }
                $cur->closeCursor();
            }
        }
    }

    /**
     * Splits a SQL string into individual statements, respecting single/double
     * quoted strings, -- line comments, /* block comments *\/, and the
     * client-only `DELIMITER` directive (as used by mysqldump / the mysql CLI
     * to define CREATE PROCEDURE/TRIGGER bodies containing their own `;`).
     * `DELIMITER` lines are recognised and consumed, not passed to the DB —
     * PDO has no built-in notion of them, unlike the mysql CLI.
     */
    private function splitStatements(string $sql): array
    {
        $out = [];
        $buf = '';
        $delimiter = ';';
        $len = strlen($sql);
        $inSingle = $inDouble = $inLine = $inBlock = false;
        $i = 0;

        while ($i < $len) {
            // Only recognised at a statement boundary (empty buffer so far),
            // outside any quote/comment — matches how the mysql CLI treats it.
            if (!$inSingle && !$inDouble && !$inLine && !$inBlock && trim($buf) === '') {
                if (preg_match('/^[ \t]*DELIMITER[ \t]+(\S+)[ \t]*\r?\n?/i', substr($sql, $i), $m)) {
                    $delimiter = $m[1];
                    $i += strlen($m[0]);
                    $buf = '';
                    continue;
                }
            }

            $ch   = $sql[$i];
            $next = $i + 1 < $len ? $sql[$i + 1] : '';

            if ($inLine)  { $buf .= $ch; if ($ch === "\n") $inLine  = false; $i++; continue; }
            if ($inBlock) { $buf .= $ch; if ($ch === '*' && $next === '/') { $buf .= $next; $i += 2; $inBlock = false; continue; } $i++; continue; }

            if (!$inSingle && !$inDouble) {
                if ($ch === '-' && $next === '-') { $inLine  = true;  $buf .= $ch; $i++; continue; }
                if ($ch === '/' && $next === '*') { $inBlock = true;  $buf .= $ch; $i++; continue; }
            }
            if ($ch === "'" && !$inDouble) {
                if ($inSingle && $next === "'") { $buf .= $ch . $next; $i += 2; continue; }
                $inSingle = !$inSingle; $buf .= $ch; $i++; continue;
            }
            if ($ch === '"' && !$inSingle) { $inDouble = !$inDouble; $buf .= $ch; $i++; continue; }

            if (!$inSingle && !$inDouble && substr($sql, $i, strlen($delimiter)) === $delimiter) {
                $out[] = $buf;
                $buf = '';
                $i += strlen($delimiter);
                continue;
            }

            $buf .= $ch;
            $i++;
        }
        if (trim($buf) !== '') $out[] = $buf;
        return $out;
    }
}
