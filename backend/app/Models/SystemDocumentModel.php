<?php

declare(strict_types=1);

namespace App\Models;

class SystemDocumentModel extends BaseModel
{
    protected string $table = 'system_documents';

    protected array $fillable = [
        'name',
        'description',
        'file_path',
        'file_name',
        'file_size',
        'file_type',
        'category',
        'uploaded_by',
        'uploaded_at',
        'is_active',
    ];

    /**
     * Get all active system documents, ordered by category and date
     */
    public function listActive(): array
    {
        $query = "
            SELECT
                sd.*,
                u.username as uploaded_by_name
            FROM {$this->table} sd
            LEFT JOIN users u ON sd.uploaded_by = u.id
            WHERE sd.is_active = 1
            ORDER BY sd.category ASC, sd.uploaded_at DESC
        ";

        return $this->db->query($query)->fetchAll() ?? [];
    }

    /**
     * Get documents by category
     */
    public function getByCategory(string $category): array
    {
        $query = "
            SELECT
                sd.*,
                u.username as uploaded_by_name
            FROM {$this->table} sd
            LEFT JOIN users u ON sd.uploaded_by = u.id
            WHERE sd.is_active = 1 AND sd.category = ?
            ORDER BY sd.uploaded_at DESC
        ";

        return $this->db->query($query, [$category])->fetchAll() ?? [];
    }

    /**
     * Get document by ID
     */
    public function getById(int $id): ?array
    {
        $query = "
            SELECT
                sd.*,
                u.username as uploaded_by_name
            FROM {$this->table} sd
            LEFT JOIN users u ON sd.uploaded_by = u.id
            WHERE sd.id = ? AND sd.is_active = 1
        ";

        return $this->db->query($query, [$id])->fetch();
    }

    /**
     * Get all categories with document counts
     */
    public function getCategories(): array
    {
        $query = "
            SELECT
                category,
                COUNT(*) as count
            FROM {$this->table}
            WHERE is_active = 1
            GROUP BY category
            ORDER BY category ASC
        ";

        return $this->db->query($query)->fetchAll() ?? [];
    }

    /**
     * Mark document as inactive (soft delete)
     */
    public function deactivate(int $id): bool
    {
        return $this->update($id, ['is_active' => 0]);
    }
}
