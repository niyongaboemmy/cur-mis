<?php

declare(strict_types=1);

namespace App\Models;

class LeaveRequestModel extends BaseModel
{
    protected string $table      = 'leave_requests';
    protected string $primaryKey = 'id';
    protected array  $fillable   = [
        'employee_id', 'user_id', 'leave_type_id',
        'start_date', 'end_date', 'days_requested',
        'reason', 'status', 'current_stage_order',
        'reviewed_by', 'reviewed_at', 'review_comment',
    ];

    /**
     * Every read of a leave request goes through the same projection so the
     * admin list, the single-request view and the approval queue can never
     * drift apart on column names. `{{where}}` is substituted by the caller.
     */
    private const DETAIL_SELECT = "
        SELECT
          lr.id,
          lr.employee_id,
          lr.user_id,
          COALESCE(CONCAT(e.employee_fname,' ',e.employee_lname), u.full_name, eu.full_name, 'Unknown') AS employee_name,
          COALESCE(e.employee_post, '')     AS department,
          COALESCE(e.employee_position, '') AS position,
          -- Self-service requests carry users.id directly; HR-filed ones reach a
          -- login (and therefore an address) through employees.user_id.
          COALESCE(NULLIF(u.email, ''), NULLIF(eu.email, '')) AS requester_email,
          lr.leave_type_id,
          lt.name              AS leave_type_name,
          lt.color             AS leave_type_color,
          lt.is_paid,
          lr.start_date,
          lr.end_date,
          lr.days_requested,
          lr.reason,
          lr.status,
          lr.current_stage_order,
          stg.stage_key        AS current_stage_key,
          stg.stage_label      AS current_stage_label,
          stg.is_final_approval AS current_stage_is_final,
          stg.sla_hours        AS current_stage_sla_hours,
          (SELECT COUNT(*) FROM leave_approval_stages s2 WHERE s2.leave_type_id = lr.leave_type_id) AS total_stages,
          -- When the request arrived at the stage it is sitting at: the most
          -- recent audit event (submitted / approved-onward / resubmitted), or
          -- creation time for a row that predates the audit trail.
          COALESCE(
            (SELECT MAX(a.decided_at) FROM leave_request_approvals a WHERE a.leave_request_id = lr.id),
            lr.created_at
          ) AS stage_entered_at,
          -- Hours spent at the current stage, and whether that breaches the
          -- stage's SLA. Computed here rather than in PHP so a queue can be
          -- ordered worst-first by the database.
          TIMESTAMPDIFF(HOUR, COALESCE(
            (SELECT MAX(a.decided_at) FROM leave_request_approvals a WHERE a.leave_request_id = lr.id),
            lr.created_at
          ), NOW()) AS hours_at_stage,
          CASE
            WHEN lr.status <> 'Pending' OR stg.sla_hours IS NULL THEN 0
            WHEN TIMESTAMPDIFF(HOUR, COALESCE(
                   (SELECT MAX(a.decided_at) FROM leave_request_approvals a WHERE a.leave_request_id = lr.id),
                   lr.created_at
                 ), NOW()) > stg.sla_hours THEN 1
            ELSE 0
          END AS is_overdue,
          lr.review_comment,
          lr.reviewed_at,
          lr.created_at
        FROM leave_requests lr
        LEFT JOIN employees  e   ON e.employee_id = lr.employee_id
        LEFT JOIN users      u   ON u.id = lr.user_id
        LEFT JOIN users      eu  ON eu.id = e.user_id
        JOIN leave_types     lt  ON lt.id = lr.leave_type_id
        LEFT JOIN leave_approval_stages stg
               ON stg.leave_type_id = lr.leave_type_id
              AND stg.stage_order   = lr.current_stage_order
    ";

    /** The shared projection with a caller-supplied WHERE/ORDER/LIMIT tail. */
    public static function detailQuery(string $tail = ''): string
    {
        return self::DETAIL_SELECT . ' ' . $tail;
    }

    /** Single request with leave-type and current-stage labels resolved. */
    public function findDetailed(int $id): array|false
    {
        return $this->db->fetchOne(self::detailQuery('WHERE lr.id = ? LIMIT 1'), [$id]);
    }

    /**
     * Requests parked at $stageOrder whose stage requires $permissionSlug.
     * Mirrors ServiceRequestModel::queueForStage — the queue is derived from
     * the chain config, never from a hardcoded role list.
     *
     * @return array<int,array<string,mixed>>
     */
    public function queueForStage(int $stageOrder, string $permissionSlug): array
    {
        return $this->db->fetchAll(
            self::detailQuery(
                "WHERE lr.status = 'Pending'
                   AND lr.current_stage_order = ?
                   AND stg.required_permission_slug = ?
                 ORDER BY is_overdue DESC, lr.created_at ASC"
            ),
            [$stageOrder, $permissionSlug]
        );
    }

    /**
     * Does an in-flight (Pending / ChangesRequested / Approved) request already
     * cover any part of [$start, $end] for this requester?
     *
     * @param 'employee_id'|'user_id' $ownerColumn
     */
    public function hasOverlap(string $ownerColumn, int $ownerId, string $start, string $end, ?int $ignoreId = null): bool
    {
        if (!in_array($ownerColumn, ['employee_id', 'user_id'], true)) {
            throw new \InvalidArgumentException("Invalid owner column '{$ownerColumn}'.");
        }

        $sql      = "SELECT COUNT(*) AS n FROM leave_requests
                     WHERE `{$ownerColumn}` = ?
                       AND status IN ('Pending','ChangesRequested','Approved')
                       AND start_date <= ? AND end_date >= ?";
        $bindings = [$ownerId, $end, $start];

        if ($ignoreId !== null) {
            $sql        .= ' AND id <> ?';
            $bindings[] = $ignoreId;
        }

        return (int) ($this->db->fetchOne($sql, $bindings)['n'] ?? 0) > 0;
    }
}
