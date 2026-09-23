<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Append-only audit trail of every decision taken on a leave request.
 * Mirrors ServiceRequestApprovalModel — rows are never updated or deleted.
 */
class LeaveRequestApprovalModel extends BaseModel
{
    protected string $table      = 'leave_request_approvals';
    protected string $primaryKey = 'id';

    protected array $fillable = [
        'leave_request_id', 'stage_order', 'stage_key', 'stage_label',
        'actor_id', 'actor_name', 'actor_role', 'decision', 'comment',
    ];

    /** @return array<int,array<string,mixed>> */
    public function findByRequest(int $leaveRequestId): array
    {
        return $this->db->fetchAll(
            "SELECT a.*, COALESCE(a.actor_name, u.full_name) AS actor_display_name
             FROM `leave_request_approvals` a
             LEFT JOIN `users` u ON u.id = a.actor_id
             WHERE a.`leave_request_id` = ?
             ORDER BY a.`decided_at` ASC, a.`id` ASC",
            [$leaveRequestId]
        );
    }
}
