<?php

declare(strict_types=1);

namespace App\Models;

class ServiceCatalogStageModel extends BaseModel
{
    protected string $table      = 'service_catalog_stages';
    protected string $primaryKey = 'id';

    protected array $fillable = [
        'service_id', 'stage_order', 'stage_key', 'stage_label',
        'required_permission_slug', 'stage_type', 'is_final_approval', 'sla_hours',
    ];

    public function findByServiceOrdered(int $serviceId): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM `service_catalog_stages` WHERE `service_id` = ? ORDER BY `stage_order` ASC",
            [$serviceId]
        );
    }

    public function deleteByService(int $serviceId): int
    {
        return $this->db->execute(
            "DELETE FROM `service_catalog_stages` WHERE `service_id` = ?",
            [$serviceId]
        );
    }

    public function findStage(int $serviceId, int $stageOrder): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `service_catalog_stages` WHERE `service_id` = ? AND `stage_order` = ? LIMIT 1",
            [$serviceId, $stageOrder]
        );
    }
}
