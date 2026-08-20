<?php

declare(strict_types=1);

namespace App\Models;

class RolePermissionModel extends BaseModel
{
    protected string $table = 'role_permissions';

    protected array $fillable = [
        'role_id',
        'permission_id',
    ];

    /**
     * Clear all permissions for a certain role.
     */
    public function clearForRole(int $roleId): bool
    {
        return $this->db->execute("DELETE FROM {$this->table} WHERE role_id = ?", [$roleId]) >= 0;
    }

    /**
     * Get all permission slugs for a given role.
     */
    public function getSlugsForRole(int $roleId): array
    {
        $sql = "SELECT DISTINCT p.slug 
                FROM {$this->table} rp 
                JOIN permissions p ON rp.permission_id = p.id 
                WHERE rp.role_id = ?";
        
        $stmt = $this->db->query($sql, [$roleId]);
        return $stmt->fetchAll(\PDO::FETCH_COLUMN) ?: [];
    }
    /**
     * Get detailed permission records (id, name, slug, category_id) for a giver role.
     */
    public function getDetailedPermissionsForRole(int $roleId): array
    {
        $sql = "SELECT DISTINCT p.id, p.name, p.slug, p.category_id 
                FROM permissions p
                JOIN role_permissions rp ON p.id = rp.permission_id
                WHERE rp.role_id = ?
                ORDER BY p.name ASC";
        
        return $this->db->fetchAll($sql, [$roleId]);
    }
}
