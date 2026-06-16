<?php

declare(strict_types=1);

namespace Core;

use PDO;
use PDOException;
use PDOStatement;

/**
 * PDO database singleton.
 *
 * One connection is created per PHP process lifetime. This is the right
 * approach for traditional synchronous PHP — connection pooling is handled
 * at the server level (e.g., ProxySQL, PgBouncer) if needed.
 *
 * Usage:
 *   $db = Database::getInstance();
 *   $users = $db->fetchAll('SELECT * FROM users WHERE active = ?', [1]);
 */
class Database
{
    private static ?Database $instance = null;
    private PDO $pdo;

    private function __construct()
    {
        $host    = $_ENV['DB_HOST']     ?? '127.0.0.1';
        $port    = $_ENV['DB_PORT']     ?? '3306';
        $dbname  = $_ENV['DB_DATABASE'] ?? '';
        $user    = $_ENV['DB_USERNAME'] ?? '';
        $pass    = $_ENV['DB_PASSWORD'] ?? '';
        $charset = $_ENV['DB_CHARSET']  ?? 'utf8mb4';

        $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset={$charset}";

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::MYSQL_ATTR_FOUND_ROWS   => true,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
        ];

        try {
            $this->pdo = new PDO($dsn, $user, $pass, $options);
        } catch (PDOException $e) {
            // Do not expose connection details in the error message
            throw new \RuntimeException('Database connection failed: ' . $e->getMessage());
        }
    }

    public static function getInstance(): static
    {
        if (static::$instance === null) {
            static::$instance = new static();
        }
        return static::$instance;
    }

    public function getPdo(): PDO
    {
        return $this->pdo;
    }

    /** Execute a prepared statement and return the statement object. */
    public function query(string $sql, array $bindings = []): PDOStatement
    {
        $stmt = $this->pdo->prepare($sql);
        try {
            $stmt->execute($bindings);
        } catch (PDOException $e) {
            error_log(sprintf('[DB] %s — SQL: %s — Bindings: %s',
                $e->getMessage(),
                preg_replace('/\s+/', ' ', trim($sql)),
                json_encode($bindings)
            ));
            throw $e;
        }
        return $stmt;
    }

    /** Fetch all matching rows. */
    public function fetchAll(string $sql, array $bindings = []): array
    {
        return $this->query($sql, $bindings)->fetchAll();
    }

    /** Fetch a single row, or false if not found. */
    public function fetchOne(string $sql, array $bindings = []): array|false
    {
        return $this->query($sql, $bindings)->fetch();
    }

    /** Execute INSERT / UPDATE / DELETE and return affected row count. */
    public function execute(string $sql, array $bindings = []): int
    {
        return $this->query($sql, $bindings)->rowCount();
    }

    /** Return the auto-increment ID of the last INSERT. */
    public function lastInsertId(): string
    {
        return $this->pdo->lastInsertId();
    }

    public function beginTransaction(): bool
    {
        return $this->pdo->beginTransaction();
    }

    public function commit(): bool
    {
        return $this->pdo->commit();
    }

    public function rollBack(): bool
    {
        return $this->pdo->rollBack();
    }

    /**
     * Run a callable inside a transaction.
     * Automatically rolls back if the callable throws.
     *
     * Usage:
     *   $db->transaction(function (Database $db) {
     *       $id = $db->execute('INSERT INTO orders ...', [...]);
     *       $db->execute('INSERT INTO order_items ...', [...]);
     *       return $id;
     *   });
     */
    public function transaction(callable $callback): mixed
    {
        $this->beginTransaction();
        try {
            $result = $callback($this);
            $this->commit();
            return $result;
        } catch (\Throwable $e) {
            $this->rollBack();
            throw $e;
        }
    }

    private function __clone() {}

    public function __wakeup(): void
    {
        throw new \RuntimeException('Cannot unserialize singleton.');
    }
}
