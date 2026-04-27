<?php

declare(strict_types=1);

namespace App\Models;

use Core\Database;

/**
 * Abstract base model.
 *
 * Provides a lightweight Active Record-style interface over PDO.
 * Concrete models extend this and define $table, $fillable, and $hidden.
 *
 * Example:
 *   class UserModel extends BaseModel {
 *       protected string $table = 'users';
 *       protected array $fillable = ['name', 'email', 'password'];
 *       protected array $hidden   = ['password'];
 *   }
 *
 *   $user = (new UserModel())->find(1);        // ['id' => 1, 'name' => 'Alice', 'email' => '...']
 *   $id   = (new UserModel())->create([...]);  // returns last insert ID as string
 */
abstract class BaseModel
{
    protected Database $db;

    /** Database table name. Must be overridden in each concrete model. */
    protected string $table = '';

    /** Primary key column name. */
    protected string $primaryKey = 'id';

    /**
     * Columns that may be mass-assigned via create() / update().
     * Leave empty to allow all columns (not recommended for user-facing inputs).
     */
    protected array $fillable = [];

    /**
     * Columns to strip from every returned row (e.g. password hashes).
     * These columns are readable via findBy() for internal checks.
     */
    protected array $hidden = ['password'];

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /** Expose the database instance for custom queries. */
    public function db(): Database
    {
        return $this->db;
    }

    // ──────────────────────────────────────────────────────────
    // Read
    // ──────────────────────────────────────────────────────────

    /** Find a row by its primary key. Returns the row or false. */
    public function find(int|string $id): array|false
    {
        $row = $this->db->fetchOne(
            "SELECT * FROM `{$this->table}` WHERE `{$this->primaryKey}` = ? LIMIT 1",
            [$id]
        );
        return $row ? $this->hideFields($row) : false;
    }

    /**
     * Find the first row where $column = $value.
     * Returns the raw row (hidden fields included) so the caller can verify
     * passwords, tokens, etc. The caller should strip hidden fields if needed.
     */
    public function findBy(string $column, mixed $value): array|false
    {
        $row = $this->db->fetchOne(
            "SELECT * FROM `{$this->table}` WHERE `{$column}` = ? LIMIT 1",
            [$value]
        );
        return $row !== false ? $row : false;
    }

    /** Fetch all rows. Use paginate() for large tables. */
    public function all(string $orderBy = '', string $direction = 'ASC'): array
    {
        $sql = "SELECT * FROM `{$this->table}`";
        if ($orderBy !== '') {
            $direction = strtoupper($direction) === 'DESC' ? 'DESC' : 'ASC';
            $sql .= " ORDER BY `{$orderBy}` {$direction}";
        }
        return array_map([$this, 'hideFields'], $this->db->fetchAll($sql));
    }

    /**
     * Paginate results.
     *
     * Returns an array shaped like PaginatedResponse<T> on the frontend:
     *   [
     *     'data'         => [...rows...],
     *     'total'        => 150,
     *     'per_page'     => 15,
     *     'current_page' => 2,
     *     'last_page'    => 10,
     *   ]
     */
    public function paginate(int $page = 1, int $perPage = 15, string $where = '', array $bindings = [], string $orderBy = '', string $direction = 'ASC'): array
    {
        $page    = max(1, $page);
        $perPage = max(1, min(100, $perPage)); // Clamp between 1 and 100
        $offset  = ($page - 1) * $perPage;
        $dir     = strtoupper($direction) === 'DESC' ? 'DESC' : 'ASC';
        // Default order column is this model's primary key — subclasses may override `$primaryKey`.
        if ($orderBy === '') {
            $orderBy = $this->primaryKey;
        }

        $whereSql = $where !== '' ? "WHERE {$where}" : '';

        $total = (int)($this->db->fetchOne(
            "SELECT COUNT(*) as cnt FROM `{$this->table}` {$whereSql}",
            $bindings
        )['cnt'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT * FROM `{$this->table}` {$whereSql} ORDER BY `{$orderBy}` {$dir} LIMIT {$perPage} OFFSET {$offset}",
            $bindings
        );

        return [
            'data'         => array_map([$this, 'hideFields'], $rows),
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / $perPage),
        ];
    }

    // ──────────────────────────────────────────────────────────
    // Write
    // ──────────────────────────────────────────────────────────

    /** Insert a new row and return the new primary key as a string. */
    public function create(array $data): string
    {
        $filtered     = $this->filterFillable($data);
        $columns      = implode('`, `', array_keys($filtered));
        $placeholders = implode(', ', array_fill(0, \count($filtered), '?'));

        $this->db->execute(
            "INSERT INTO `{$this->table}` (`{$columns}`) VALUES ({$placeholders})",
            array_values($filtered)
        );

        return $this->db->lastInsertId();
    }

    /** Update a row by primary key. Returns number of affected rows. */
    public function update(int|string $id, array $data): int
    {
        $filtered = $this->filterFillable($data);

        if (empty($filtered)) {
            return 0;
        }

        $sets = implode(', ', array_map(fn($c) => "`{$c}` = ?", array_keys($filtered)));

        return $this->db->execute(
            "UPDATE `{$this->table}` SET {$sets} WHERE `{$this->primaryKey}` = ?",
            [...array_values($filtered), $id]
        );
    }

    /** Delete a row by primary key. Returns number of affected rows. */
    public function delete(int|string $id): int
    {
        return $this->db->execute(
            "DELETE FROM `{$this->table}` WHERE `{$this->primaryKey}` = ?",
            [$id]
        );
    }

    // ──────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────

    /**
     * Check whether a row exists with the given column value.
     * Pass $excludeId to skip a specific row (useful for unique-check on update).
     */
    public function exists(string $column, mixed $value, int|string|null $excludeId = null): bool
    {
        $sql      = "SELECT COUNT(*) as cnt FROM `{$this->table}` WHERE `{$column}` = ?";
        $bindings = [$value];

        if ($excludeId !== null) {
            $sql       .= " AND `{$this->primaryKey}` != ?";
            $bindings[] = $excludeId;
        }

        $row = $this->db->fetchOne($sql, $bindings);
        return ($row['cnt'] ?? 0) > 0;
    }

    /** Strip columns not in $fillable before writing to the database. */
    protected function filterFillable(array $data): array
    {
        if (empty($this->fillable)) {
            return $data;
        }
        return array_intersect_key($data, array_flip($this->fillable));
    }

    /** Remove $hidden columns from a row before returning it to callers. */
    protected function hideFields(array $row): array
    {
        foreach ($this->hidden as $field) {
            unset($row[$field]);
        }
        return $row;
    }
}
