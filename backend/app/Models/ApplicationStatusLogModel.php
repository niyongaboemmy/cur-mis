<?php

declare(strict_types=1);

namespace App\Models;

class ApplicationStatusLogModel extends BaseModel
{
    protected string $table    = 'application_status_log';
    protected array  $fillable = ['application_id', 'from_status', 'to_status', 'actor_id', 'actor_type', 'notes'];
    protected array  $hidden   = [];

    public function getForApplication(int $applicationId): array
    {
        return $this->db->fetchAll(
            "SELECT asl.*, u.full_name AS actor_name
             FROM `application_status_log` asl
             LEFT JOIN `users` u ON u.id = asl.actor_id
             WHERE asl.application_id = ?
             ORDER BY asl.created_at ASC",
            [$applicationId]
        );
    }
}
