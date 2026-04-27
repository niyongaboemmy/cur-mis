<?php

declare(strict_types=1);

namespace App\Models;

class RoleModel extends BaseModel
{
    protected string $table = 'roles';

    protected array $fillable = [
        'name',
        'description',
    ];

    public function getIdByName(string $name): ?int
    {
        $role = $this->findBy('name', $name);
        return $role ? (int)$role['id'] : null;
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
