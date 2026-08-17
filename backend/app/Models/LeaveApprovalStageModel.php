<?php

declare(strict_types=1);

namespace App\Models;

/**
 * The configurable approval chain for a leave type.
 * Mirrors ServiceCatalogStageModel — one row per (leave type, stage).
 */
class LeaveApprovalStageModel extends BaseModel
{
    protected string $table      = 'leave_approval_stages';
    protected string $primaryKey = 'id';

    protected array $fillable = [
        'leave_type_id', 'stage_order', 'stage_key', 'stage_label',
        'required_permission_slug', 'is_final_approval', 'sla_hours',
    ];

    /** @return array<int,array<string,mixed>> */
    public function findByLeaveTypeOrdered(int $leaveTypeId): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM `leave_approval_stages` WHERE `leave_type_id` = ? ORDER BY `stage_order` ASC",
            [$leaveTypeId]
        );
    }

    public function findStage(int $leaveTypeId, int $stageOrder): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `leave_approval_stages`
             WHERE `leave_type_id` = ? AND `stage_order` = ? LIMIT 1",
            [$leaveTypeId, $stageOrder]
        );
    }

    public function deleteByLeaveType(int $leaveTypeId): int
    {
        return $this->db->execute(
            "DELETE FROM `leave_approval_stages` WHERE `leave_type_id` = ?",
            [$leaveTypeId]
        );
    }
}
