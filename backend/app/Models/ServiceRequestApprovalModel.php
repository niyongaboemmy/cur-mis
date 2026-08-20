<?php

declare(strict_types=1);

namespace App\Models;

/** Append-only audit log — mirrors ApplicationStatusLogModel's shape (create() only). */
class ServiceRequestApprovalModel extends BaseModel
{
    protected string $table      = 'service_request_approvals';
    protected string $primaryKey = 'id';

    protected array $fillable = [
        'service_request_id', 'stage_order', 'stage_key',
        'actor_id', 'actor_name', 'actor_role', 'decision', 'comment',
    ];

    public function findByRequest(int $serviceRequestId): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM `service_request_approvals` WHERE `service_request_id` = ? ORDER BY `decided_at` ASC, `id` ASC",
            [$serviceRequestId]
        );
    }
}
