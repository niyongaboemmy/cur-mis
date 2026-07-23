<?php

declare(strict_types=1);

namespace App\Models;

class ServiceCatalogModel extends BaseModel
{
    protected string $table      = 'service_catalog';
    protected string $primaryKey = 'id';

    protected array $fillable = [
        'code', 'name', 'slug', 'category', 'short_description', 'full_description',
        'requirements', 'required_attachments', 'document_template_type', 'document_type_id',
        'fee_amount', 'fee_currency', 'requires_payment', 'payment_stage',
        'processing_sla_days', 'is_active', 'created_by', 'updated_by',
    ];

    public function listActive(): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM `service_catalog` WHERE `is_active` = 1 ORDER BY `name` ASC"
        );
    }

    public function listAllForAdmin(): array
    {
        return $this->db->fetchAll(
            "SELECT sc.*,
                    (SELECT COUNT(*) FROM `service_catalog_stages` WHERE service_id = sc.id) AS stage_count,
                    (SELECT COUNT(*) FROM `service_requests` WHERE service_id = sc.id) AS request_count
             FROM `service_catalog` sc
             ORDER BY sc.created_at DESC"
        );
    }

    public function findBySlug(string $slug): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `service_catalog` WHERE `slug` = ? LIMIT 1",
            [$slug]
        );
    }

    public function findActiveBySlug(string $slug): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `service_catalog` WHERE `slug` = ? AND `is_active` = 1 LIMIT 1",
            [$slug]
        );
    }
}
