<?php

declare(strict_types=1);

namespace App\Models;

class RoleModel extends BaseModel
{
    protected string $table = 'roles';

    protected array $fillable = [
        'name',
        'description',
        'enforce_campus_scope',
    ];

    public function getIdByName(string $name): ?int
    {
        $role = $this->findBy('name', $name);
        return $role ? (int)$role['id'] : null;
    }

    /**
     * Case-insensitive name lookup, independent of the column's collation —
     * a role named "Admin" must collide with "admin" (Finding A: a
     * case-variant name must not slip past the system-role bypass).
     */
    public function findByNameCaseInsensitive(string $name): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `{$this->table}` WHERE LOWER(`name`) = LOWER(?) LIMIT 1",
            [$name]
        );
    }

    /**
     * Get all roles with the number of users assigned to each.
     */
    public function getWithUserCounts(): array
    {
        $sql = "SELECT r.*, 
                       (SELECT COUNT(*) FROM users WHERE role_id = r.id) as user_count 
                FROM `roles` r 
                ORDER BY r.name ASC";
        return $this->db->fetchAll($sql);
    }
}
