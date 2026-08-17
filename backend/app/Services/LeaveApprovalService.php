<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;
use App\Models\LeaveTypeModel;
use App\Models\LeaveRequestModel;
use App\Models\LeaveBalanceModel;
use App\Models\LeaveApprovalStageModel;
use App\Models\LeaveRequestApprovalModel;
use App\Models\NotificationModel;
use App\Constants\Permissions;
use App\Helpers\EmailTemplateHelper;

/**
 * State machine for leave requests.
 *
 * Modelled directly on App\Services\ServiceRequestService (the service-request /
 * mission-authorization approval flow): a request carries a pointer into a
 * per-leave-type chain of stages, each stage names the permission slug an actor
 * must hold to decide it, every decision is appended to an immutable audit
 * trail, and status changes are only ever made through an explicit transition
 * whitelist.
 *
 * Nothing about *who* approves is hardcoded here — the chain lives in
 * `leave_approval_stages` and is editable per leave type.
 */
class LeaveApprovalService
{
    private LeaveTypeModel            $typeModel;
    private LeaveRequestModel         $requestModel;
    private LeaveBalanceModel         $balanceModel;
    private LeaveApprovalStageModel   $stageModel;
    private LeaveRequestApprovalModel $approvalModel;
    private Database                  $db;

    /**
     * Whitelisted status transitions. Checked with in_array(..., true) before
     * any write, same as ServiceRequestService::ALLOWED_TRANSITIONS.
     */
    private const ALLOWED_TRANSITIONS = [
        'Pending'          => ['Pending', 'ChangesRequested', 'Approved', 'Rejected', 'Cancelled'],
        'ChangesRequested' => ['Pending', 'Cancelled'],
        'Approved'         => ['Cancelled'],
        'Rejected'         => [],
        'Cancelled'        => [],
    ];

    /**
     * Every permission a chain stage may be gated on. The institution's own
     * signature sequence (VC → HR → DAF → VC final) comes first; L1/L2 remain
     * for a leave type configured with a shorter generic chain.
     */
    public const STAGE_PERMISSIONS = [
        Permissions::APPROVE_LEAVE_VC,
        Permissions::APPROVE_LEAVE_HR,
        Permissions::APPROVE_LEAVE_DAF,
        Permissions::APPROVE_LEAVE_L1,
        Permissions::APPROVE_LEAVE_L2,
        Permissions::APPROVE_LEAVE_FINAL,
    ];

    /** Highest stage_order the queue scan will look at. */
    private const MAX_STAGE_ORDER = 10;

    public const DECISIONS = ['approved', 'rejected', 'changes_requested'];

    public function __construct()
    {
        $this->typeModel     = new LeaveTypeModel();
        $this->requestModel  = new LeaveRequestModel();
        $this->balanceModel  = new LeaveBalanceModel();
        $this->stageModel    = new LeaveApprovalStageModel();
        $this->approvalModel = new LeaveRequestApprovalModel();
        $this->db            = Database::getInstance();
    }

    // ──────────────────────────────────────────────────────────
    // Chain resolution
    // ──────────────────────────────────────────────────────────

    /**
     * The ordered stage chain for a leave type.
     *
     * A leave type with no configured stages falls back to an implicit
     * single-stage chain gated on MANAGE_LEAVE_REQUESTS — the pre-refactor
     * behaviour — so a type created before/outside the stage seeder is still
     * approvable instead of dead-ending on "no stage configured".
     *
     * @return array<int,array<string,mixed>>
     */
    public function chainFor(int $leaveTypeId): array
    {
        $stages = $this->stageModel->findByLeaveTypeOrdered($leaveTypeId);
        if (!empty($stages)) {
            return $stages;
        }

        return [[
            'leave_type_id'            => $leaveTypeId,
            'stage_order'              => 1,
            'stage_key'                => 'leave_approval',
            'stage_label'              => 'Leave Approval',
            'required_permission_slug' => Permissions::MANAGE_LEAVE_REQUESTS,
            'is_final_approval'        => 1,
            'sla_hours'                => null,
        ]];
    }

    /** The stage a request currently sits at, or null when the chain is exhausted. */
    public function stageFor(int $leaveTypeId, int $stageOrder): ?array
    {
        foreach ($this->chainFor($leaveTypeId) as $stage) {
            if ((int) $stage['stage_order'] === $stageOrder) {
                return $stage;
            }
        }
        return null;
    }

    /** The stage after $stageOrder in the chain, or null if $stageOrder is last. */
    private function nextStage(int $leaveTypeId, int $stageOrder): ?array
    {
        foreach ($this->chainFor($leaveTypeId) as $stage) {
            if ((int) $stage['stage_order'] > $stageOrder) {
                return $stage;
            }
        }
        return null;
    }

    /**
     * Replace a leave type's whole chain in one shot.
     * Mirrors ServiceCatalogService::replaceStages.
     *
     * @param array<int,array<string,mixed>> $stages
     */
    public function replaceChain(int $leaveTypeId, array $stages): array
    {
        $this->validateChain($stages);

        $this->stageModel->deleteByLeaveType($leaveTypeId);

        foreach (array_values($stages) as $i => $stage) {
            $this->stageModel->create([
                'leave_type_id'            => $leaveTypeId,
                'stage_order'              => $i + 1,
                'stage_key'                => trim((string) $stage['stage_key']),
                'stage_label'              => trim((string) $stage['stage_label']),
                'required_permission_slug' => trim((string) $stage['required_permission_slug']),
                'is_final_approval'        => !empty($stage['is_final_approval']) ? 1 : 0,
                'sla_hours'                => isset($stage['sla_hours']) && $stage['sla_hours'] !== ''
                    ? (int) $stage['sla_hours']
                    : null,
            ]);
        }

        return $this->stageModel->findByLeaveTypeOrdered($leaveTypeId);
    }

    /**
     * A chain is only usable if it has at least one stage, exactly one final
     * stage, and that final stage is last — otherwise a request could either
     * never complete or complete while stages remain.
     */
    private function validateChain(array $stages): void
    {
        if (empty($stages)) {
            throw new \RuntimeException('An approval chain needs at least one stage.');
        }

        $finalIndexes = [];
        foreach (array_values($stages) as $i => $stage) {
            foreach (['stage_key', 'stage_label', 'required_permission_slug'] as $field) {
                if (trim((string) ($stage[$field] ?? '')) === '') {
                    throw new \RuntimeException("Stage " . ($i + 1) . " is missing '{$field}'.");
                }
            }
            if (!in_array((string) $stage['required_permission_slug'], Permissions::all(), true)) {
                throw new \RuntimeException("Unknown permission slug '{$stage['required_permission_slug']}' on stage " . ($i + 1) . '.');
            }
            if (!empty($stage['is_final_approval'])) {
                $finalIndexes[] = $i;
            }
        }

        if (count($finalIndexes) !== 1) {
            throw new \RuntimeException('Exactly one stage must be marked as the final approval.');
        }
        if ($finalIndexes[0] !== count($stages) - 1) {
            throw new \RuntimeException('The final approval must be the last stage in the chain.');
        }

        $keys = array_map(static fn(array $s): string => trim((string) $s['stage_key']), array_values($stages));
        if (count(array_unique($keys)) !== count($keys)) {
            throw new \RuntimeException('Stage keys must be unique within a chain.');
        }
    }

    // ──────────────────────────────────────────────────────────
    // Submission
    // ──────────────────────────────────────────────────────────

    /**
     * Create a leave request and enter it at stage 1.
     *
     * One code path for both entry points: HR filing on behalf of an employee
     * ($ownerColumn = 'employee_id') and a staff member filing for themselves
     * ($ownerColumn = 'user_id'). Previously duplicated across
     * LeaveController::store() and ::submitOwn().
     *
     * @param 'employee_id'|'user_id' $ownerColumn
     * @return array<string,mixed> the created request row
     */
    public function submit(
        string $ownerColumn,
        int $ownerId,
        int $leaveTypeId,
        string $start,
        string $end,
        string $reason,
        array $actor
    ): array {
        $type = $this->typeModel->find($leaveTypeId);
        if (!$type) {
            throw new \RuntimeException('Leave type not found.');
        }
        if (isset($type['is_active']) && !(int) $type['is_active']) {
            throw new \RuntimeException("Leave type '{$type['name']}' is no longer active.");
        }

        $days = $this->calcBusinessDays($start, $end);
        if ($days <= 0) {
            throw new \RuntimeException('End date must be on or after start date and include at least one working day.');
        }

        if ($this->requestModel->hasOverlap($ownerColumn, $ownerId, $start, $end)) {
            throw new \RuntimeException($ownerColumn === 'user_id'
                ? 'You already have a leave request in progress overlapping these dates.'
                : 'This employee already has a leave request in progress overlapping these dates.');
        }

        // Also file the self-service requester's employee_id when we can resolve
        // one, so the balance is debited on final approval rather than silently
        // skipped (the old flow never touched balances for self-service leave).
        $payload = [
            $ownerColumn     => $ownerId,
            'leave_type_id'  => $leaveTypeId,
            'start_date'     => $start,
            'end_date'       => $end,
            'days_requested' => $days,
            'reason'         => $reason,
            'status'         => 'Pending',
            'current_stage_order' => 1,
        ];
        if ($ownerColumn === 'user_id') {
            $employeeId = $this->resolveEmployeeIdForUser($ownerId);
            if ($employeeId !== null) {
                $payload['employee_id'] = $employeeId;
            }
        }

        $id = (int) $this->requestModel->create($payload);

        $firstStage = $this->stageFor($leaveTypeId, 1);
        $this->logDecision($id, 1, 'submission', 'Request Submitted', 'submitted', $actor, null);

        SystemLogService::log(
            'CREATE',
            'HR',
            "Leave request #{$id} submitted ({$days} working days, {$start} → {$end}) — entering stage '"
                . ($firstStage['stage_label'] ?? 'Leave Approval') . "'.",
            $id,
            'leave_request',
            [$ownerColumn => $ownerId, 'days' => $days, 'start' => $start, 'end' => $end],
            $actor ?: null
        );

        $row = $this->requestModel->findDetailed($id);
        if ($row) {
            $this->notifyRequester($row, 'Submitted', '', $firstStage);
            if ($firstStage) {
                $this->notifyStageReviewers($row, $firstStage, $actor);
            }
        }

        return $row ?: [];
    }

    /**
     * Requester answers a "changes requested" decision: the request re-enters
     * review at the SAME stage that flagged it, mirroring
     * ServiceRequestService::resubmit().
     */
    public function resubmit(int $requestId, int $userId, array $fields, array $actor): array
    {
        $row = $this->requestModel->find($requestId);
        if (!$row || (int) ($row['user_id'] ?? 0) !== $userId) {
            throw new \RuntimeException('Leave request not found.');
        }
        if ($row['status'] !== 'ChangesRequested') {
            throw new \RuntimeException("Only a request with changes requested can be resubmitted. This one is '{$row['status']}'.");
        }

        $start = trim((string) ($fields['start_date'] ?? $row['start_date']));
        $end   = trim((string) ($fields['end_date']   ?? $row['end_date']));
        $days  = $this->calcBusinessDays($start, $end);
        if ($days <= 0) {
            throw new \RuntimeException('End date must be on or after start date and include at least one working day.');
        }
        if ($this->requestModel->hasOverlap('user_id', $userId, $start, $end, $requestId)) {
            throw new \RuntimeException('You already have another leave request in progress overlapping these dates.');
        }

        $stageOrder = (int) $row['current_stage_order'];
        $stage      = $this->stageFor((int) $row['leave_type_id'], $stageOrder);

        $this->transition($requestId, (string) $row['status'], 'Pending', [
            'start_date'     => $start,
            'end_date'       => $end,
            'days_requested' => $days,
            'reason'         => trim((string) ($fields['reason'] ?? $row['reason'] ?? '')),
            'review_comment' => null,
        ]);

        $this->logDecision(
            $requestId,
            $stageOrder,
            $stage['stage_key'] ?? 'resubmission',
            $stage['stage_label'] ?? null,
            'resubmitted',
            $actor,
            trim((string) ($fields['reason'] ?? '')) ?: null
        );

        SystemLogService::log('UPDATE', 'HR', "Leave request #{$requestId} resubmitted after changes were requested.", $requestId, 'leave_request', ['user_id' => $userId], $actor ?: null);

        $updated = $this->requestModel->findDetailed($requestId);
        if ($updated) {
            // Back under review, at the same stage — so the reviewer who asked
            // for the change is the one who needs to hear about it.
            $this->notifyRequester($updated, 'Resubmitted', '', $stage);
            if ($stage) {
                $this->notifyStageReviewers($updated, $stage, $actor);
            }
        }

        return $updated ?: [];
    }

    // ──────────────────────────────────────────────────────────
    // Approval queue + decisions
    // ──────────────────────────────────────────────────────────

    /**
     * Everything currently parked at a stage this actor can decide.
     * Same shape as ServiceRequestApprovalController::queue().
     *
     * @return array<int,array<string,mixed>>
     */
    public function queueForActor(array $actorPermissions, bool $isSuperadmin): array
    {
        $held = $isSuperadmin
            ? array_merge(self::STAGE_PERMISSIONS, [Permissions::MANAGE_LEAVE_REQUESTS])
            : array_values(array_intersect(
                array_merge(self::STAGE_PERMISSIONS, [Permissions::MANAGE_LEAVE_REQUESTS]),
                $actorPermissions
            ));

        if (empty($held)) {
            return [];
        }

        $rows = [];
        foreach ($held as $slug) {
            for ($order = 1; $order <= self::MAX_STAGE_ORDER; $order++) {
                foreach ($this->requestModel->queueForStage($order, $slug) as $row) {
                    // A slug can gate more than one stage; key by id so a
                    // request is never listed twice.
                    $rows[(int) $row['id']] = $row;
                }
            }
        }

        // Implicit-chain requests (leave type with no configured stages) never
        // match the join above, because there is no stages row to join to.
        if (in_array(Permissions::MANAGE_LEAVE_REQUESTS, $held, true)) {
            foreach ($this->unchainedPending() as $row) {
                $rows[(int) $row['id']] = $row;
            }
        }

        usort($rows, static fn(array $a, array $b): int => strcmp((string) $a['created_at'], (string) $b['created_at']));

        return array_values($rows);
    }

    /** Pending requests whose leave type has no configured chain at all. */
    private function unchainedPending(): array
    {
        return $this->db->fetchAll(LeaveRequestModel::detailQuery(
            "WHERE lr.status = 'Pending'
               AND NOT EXISTS (
                     SELECT 1 FROM leave_approval_stages s3
                     WHERE s3.leave_type_id = lr.leave_type_id
                   )
             ORDER BY lr.created_at ASC"
        ));
    }

    /**
     * Record one stage decision and move the request accordingly.
     *
     * @param 'approved'|'rejected'|'changes_requested' $decision
     * @return array<string,mixed> the updated request row
     */
    public function decide(int $requestId, string $decision, array $actorPermissions, array $actor, ?string $comment): array
    {
        if (!in_array($decision, self::DECISIONS, true)) {
            throw new \RuntimeException('Invalid decision.');
        }

        $row = $this->requestModel->find($requestId);
        if (!$row) {
            throw new \RuntimeException('Leave request not found.');
        }
        if ($row['status'] !== 'Pending') {
            throw new \RuntimeException("This request is not awaiting review (current status: {$row['status']}).");
        }

        $comment = trim((string) $comment);
        if ($decision !== 'approved' && $comment === '') {
            throw new \RuntimeException($decision === 'rejected'
                ? 'A rejection reason is required.'
                : 'Say what needs to change before sending the request back.');
        }

        $actorId    = (int) ($actor['id'] ?? 0);
        $stageOrder = (int) $row['current_stage_order'];
        $stage      = $this->stageFor((int) $row['leave_type_id'], $stageOrder);

        if (!$stage) {
            throw new \RuntimeException('No approval stage is configured for this request at its current position in the chain.');
        }

        // Defense in depth: the route already gated entry to the approval
        // endpoints on holding *some* stage permission — re-check that the
        // actor holds the one THIS stage requires.
        if (!in_array((string) $stage['required_permission_slug'], $actorPermissions, true)) {
            throw new \RuntimeException("You do not hold the permission required to decide the '{$stage['stage_label']}' stage.");
        }

        // Nobody signs off their own leave, at any stage — including a request
        // HR filed on their behalf, which carries employee_id rather than
        // user_id and would otherwise slip past this check.
        if ($actorId > 0 && $this->requesterLoginId($row) === $actorId) {
            throw new \RuntimeException('You cannot decide your own leave request.');
        }

        $this->logDecision($requestId, $stageOrder, (string) $stage['stage_key'], (string) $stage['stage_label'], $decision, $actor, $comment ?: null);

        $reviewMeta = [
            'review_comment' => $comment ?: null,
            'reviewed_by'    => $actorId ?: null,
            'reviewed_at'    => $this->dbNow(),
        ];

        if ($decision === 'rejected') {
            $this->transition($requestId, 'Pending', 'Rejected', $reviewMeta);
            $this->logAndNotify($requestId, 'REJECT', "Rejected leave request #{$requestId} at stage '{$stage['stage_label']}'. Reason: {$comment}", 'Rejected', $comment, $stage, $actor);
            return $this->requestModel->findDetailed($requestId) ?: [];
        }

        if ($decision === 'changes_requested') {
            $this->transition($requestId, 'Pending', 'ChangesRequested', $reviewMeta);
            $this->logAndNotify($requestId, 'UPDATE', "Requested changes on leave request #{$requestId} at stage '{$stage['stage_label']}'.", 'ChangesRequested', $comment, $stage, $actor);
            return $this->requestModel->findDetailed($requestId) ?: [];
        }

        // ── approved ────────────────────────────────────────────────────────
        if (empty($stage['is_final_approval'])) {
            $next = $this->nextStage((int) $row['leave_type_id'], $stageOrder);
            if (!$next) {
                throw new \RuntimeException('This stage is not the final approval, but the chain has no next stage. Fix the approval chain for this leave type.');
            }

            // Status stays Pending; only the chain pointer advances.
            $this->transition($requestId, 'Pending', 'Pending', $reviewMeta + [
                'current_stage_order' => (int) $next['stage_order'],
            ]);
            $this->logAndNotify($requestId, 'APPROVE', "Approved leave request #{$requestId} at stage '{$stage['stage_label']}' — advanced to '{$next['stage_label']}'.", 'StageApproved', $comment, $stage, $actor, $next);
            return $this->requestModel->findDetailed($requestId) ?: [];
        }

        $this->transition($requestId, 'Pending', 'Approved', $reviewMeta);

        // Only the final approval debits the balance — an intermediate sign-off
        // must never consume days the request might still be refused.
        $this->adjustBalance($row, +1);

        $this->logAndNotify($requestId, 'APPROVE', "Granted leave request #{$requestId} at final stage '{$stage['stage_label']}' ({$row['days_requested']} days).", 'Approved', $comment, $stage, $actor);

        return $this->requestModel->findDetailed($requestId) ?: [];
    }

    /**
     * Cancel a request. $selfUserId is set when the requester cancels their own
     * (they may only cancel while it is still in flight); when null the caller
     * is an administrator, who may also cancel an already-granted leave and
     * have the balance credited back.
     */
    public function cancel(int $requestId, ?int $selfUserId, array $actor, ?string $reason = null): array
    {
        $row = $this->requestModel->find($requestId);
        if (!$row) {
            throw new \RuntimeException('Leave request not found.');
        }

        $isSelf = $selfUserId !== null;
        if ($isSelf && (int) ($row['user_id'] ?? 0) !== $selfUserId) {
            throw new \RuntimeException('Leave request not found.');
        }

        $status = (string) $row['status'];

        if ($isSelf && !in_array($status, ['Pending', 'ChangesRequested'], true)) {
            throw new \RuntimeException("Only a request still under review can be cancelled. This one is '{$status}'.");
        }
        if (!in_array('Cancelled', self::ALLOWED_TRANSITIONS[$status] ?? [], true)) {
            throw new \RuntimeException("A '{$status}' leave request can no longer be cancelled.");
        }

        // Credit the days back only if the final approval had actually debited them.
        if ($status === 'Approved') {
            $this->adjustBalance($row, -1);
        }

        $stage = $this->stageFor((int) $row['leave_type_id'], (int) $row['current_stage_order']);

        $this->transition($requestId, $status, 'Cancelled', [
            'reviewed_by' => (int) ($actor['id'] ?? 0) ?: null,
            'reviewed_at' => $this->dbNow(),
        ]);

        $this->logDecision(
            $requestId,
            (int) $row['current_stage_order'],
            $stage['stage_key'] ?? 'cancellation',
            $stage['stage_label'] ?? null,
            'cancelled',
            $actor,
            $reason
        );

        SystemLogService::log('UPDATE', 'HR', "Cancelled leave request #{$requestId} (was {$status}).", $requestId, 'leave_request', ['previous_status' => $status, 'by_requester' => $isSelf], $actor ?: null);

        // Nobody should still be prompted to decide a cancelled request.
        $this->retireAwaitingNotifications($requestId);

        $detailed = $this->requestModel->findDetailed($requestId);
        if ($detailed && !$isSelf) {
            // Only tell the requester when someone else cancelled on them.
            $this->notifyRequester($detailed, 'Cancelled', (string) $reason);
        }

        return $detailed ?: [];
    }

    // ──────────────────────────────────────────────────────────
    // Progress / history
    // ──────────────────────────────────────────────────────────

    /** Ordered audit trail for a request. */
    public function history(int $requestId): array
    {
        return $this->approvalModel->findByRequest($requestId);
    }

    /**
     * Stepper view of where a request stands, built from the live chain — never
     * a hardcoded list of steps. Labels only; permission slugs are not exposed.
     */
    public function progress(int $requestId): ?array
    {
        $row = $this->requestModel->findDetailed($requestId);
        if (!$row) {
            return null;
        }

        $steps = $this->buildSteps($row);

        // Enough of the request itself for the progress view to caption what it
        // is showing, so the caller does not need a second fetch to say which
        // request this chain belongs to.
        return [
            'id'              => (int) $row['id'],
            'status'          => $row['status'],
            'employee_name'   => $row['employee_name'] ?? null,
            'leave_type_name' => $row['leave_type_name'] ?? null,
            'leave_type_color'=> $row['leave_type_color'] ?? null,
            'start_date'      => $row['start_date'] ?? null,
            'end_date'        => $row['end_date'] ?? null,
            'days_requested'  => $row['days_requested'] ?? null,
            'reason'          => $row['reason'] ?? null,
            'steps'           => $steps,
            'current_step'    => $this->currentStepIndex($steps),
            'total_steps'     => count($steps),
            // How many of the chain's approval stages are signed, and how many
            // there are — the submission and outcome steps are not signatures.
            'signatures_done' => count(array_filter(
                array_slice($steps, 1, max(0, count($steps) - 2)),
                static fn(array $st): bool => $st['state'] === 'completed'
            )),
            'signatures_total' => max(0, count($steps) - 2),
            'history'          => $this->history($requestId),
        ];
    }

    /**
     * The ordered step list for a request.
     *
     * Each stage step carries its own SLA and, when it is the step currently
     * awaiting a decision, how long it has been waiting and whether that
     * breaches the SLA — so the stepper can say "waiting 3d of 48h allowed"
     * rather than just "awaiting decision".
     *
     * `decided_at` comes from the audit trail, so a cleared step can show when
     * it was cleared and by whom without the caller cross-referencing history.
     *
     * @return array<int,array<string,mixed>>
     */
    private function buildSteps(array $row): array
    {
        $status       = (string) $row['status'];
        $currentOrder = (int) $row['current_stage_order'];
        $terminalBad  = in_array($status, ['Rejected', 'Cancelled'], true);
        $granted      = $status === 'Approved';

        // stage_key => the last decision recorded against it.
        $decisions = [];
        foreach ($this->history((int) $row['id']) as $event) {
            $decisions[(string) $event['stage_key']] = $event;
        }

        $submission = $decisions['submission'] ?? null;

        // Step 1 of the institutional flow: the requester prepares and signs.
        // It is the submission itself, not a stage anyone approves.
        $steps = [[
            'key'        => 'submission',
            'label'      => 'Prepared by (Responsible Officer)',
            'state'      => 'completed',
            'sla_hours'  => null,
            'decided_at' => $submission['decided_at'] ?? ($row['created_at'] ?? null),
            'actor'      => $submission['actor_display_name'] ?? null,
            'actor_role' => $submission['actor_role'] ?? null,
        ]];

        foreach ($this->chainFor((int) $row['leave_type_id']) as $stage) {
            $order = (int) $stage['stage_order'];
            $key   = (string) $stage['stage_key'];

            if ($granted || $order < $currentOrder) {
                $state = 'completed';
            } elseif ($order === $currentOrder) {
                $state = match ($status) {
                    'Rejected'         => 'rejected',
                    'ChangesRequested' => 'changes_requested',
                    'Cancelled'        => 'cancelled',
                    default            => 'current',
                };
            } else {
                $state = $terminalBad ? 'skipped' : 'pending';
            }

            $isAwaiting = $state === 'current';
            $sla        = $stage['sla_hours'] !== null ? (int) $stage['sla_hours'] : null;

            $steps[] = [
                'key'            => $key,
                'label'          => (string) $stage['stage_label'],
                'state'          => $state,
                'sla_hours'      => $sla,
                'decided_at'     => $state === 'pending' || $state === 'skipped'
                    ? null
                    : ($decisions[$key]['decided_at'] ?? null),
                'actor'          => $decisions[$key]['actor_display_name'] ?? null,
                // The office that signed, e.g. "VC" / "HR" / "DAF" — the flow is
                // a sequence of signature blocks, so who signed matters as much
                // as when.
                'actor_role'     => $decisions[$key]['actor_role'] ?? null,
                'comment'        => $decisions[$key]['comment'] ?? null,
                // Only the awaiting step has a running clock.
                'hours_waiting'  => $isAwaiting ? (int) ($row['hours_at_stage'] ?? 0) : null,
                'is_overdue'     => $isAwaiting && !empty($row['is_overdue']),
            ];
        }

        $steps[] = [
            'key'        => 'granted',
            'label'      => 'Leave Granted',
            'state'      => $granted ? 'completed' : ($terminalBad ? 'skipped' : 'pending'),
            'sla_hours'  => null,
            'decided_at' => $granted ? ($row['reviewed_at'] ?? null) : null,
            'actor'      => null,
            'actor_role' => null,
        ];

        return $steps;
    }

    /** 1-based index of the first unfinished step, or the last step when done. */
    private function currentStepIndex(array $steps): int
    {
        foreach ($steps as $i => $step) {
            if (!in_array($step['state'], ['completed', 'skipped'], true)) {
                return $i + 1;
            }
        }
        return count($steps);
    }

    // ──────────────────────────────────────────────────────────
    // Internals
    // ──────────────────────────────────────────────────────────

    /**
     * The database's clock, as a 'Y-m-d H:i:s' string.
     *
     * `leave_request_approvals.decided_at` defaults to CURRENT_TIMESTAMP, so it
     * is written by MySQL, while `leave_requests.reviewed_at` is written by the
     * application. PHP here runs in UTC and MySQL in system time, so using
     * PHP's date() put the two timestamps for a single decision two hours apart
     * — the audit trail and the request row visibly disagreeing about when
     * something was signed. Reading the clock from the database keeps every
     * timestamp in this module on one clock, whatever the deployment's offset.
     */
    private function dbNow(): string
    {
        $row = $this->db->fetchOne('SELECT NOW() AS now_at');

        // If the clock cannot be read there is nothing better than PHP's.
        return (string) ($row['now_at'] ?? date('Y-m-d H:i:s'));
    }

    /** Guarded status write — the only place leave_requests.status changes. */
    private function transition(int $requestId, string $from, string $to, array $extra = []): void
    {
        $allowed = self::ALLOWED_TRANSITIONS[$from] ?? [];
        if (!in_array($to, $allowed, true)) {
            throw new \RuntimeException("Invalid leave request transition from '{$from}' to '{$to}'.");
        }
        $this->requestModel->update($requestId, $extra + ['status' => $to]);
    }

    private function logDecision(
        int $requestId,
        int $stageOrder,
        string $stageKey,
        ?string $stageLabel,
        string $decision,
        array $actor,
        ?string $comment
    ): void {
        $this->approvalModel->create([
            'leave_request_id' => $requestId,
            'stage_order'      => $stageOrder,
            'stage_key'        => $stageKey,
            'stage_label'      => $stageLabel,
            'actor_id'         => (int) ($actor['id'] ?? 0) ?: null,
            'actor_name'       => $actor['full_name'] ?? null,
            'actor_role'       => $actor['role'] ?? null,
            'decision'         => $decision,
            'comment'          => $comment,
        ]);
    }

    /**
     * Audit-log, tell the requester, and hand the baton to whoever now owns the
     * request — every decision branch needs all three.
     */
    private function logAndNotify(
        int $requestId,
        string $action,
        string $logMessage,
        string $notifyStatus,
        string $comment,
        array $stage,
        array $actor,
        ?array $nextStage = null
    ): void {
        SystemLogService::log($action, 'HR', $logMessage, $requestId, 'leave_request', ['stage' => $stage['stage_key'] ?? null, 'comment' => $comment], $actor ?: null);

        // The request has moved off the stage it was sitting at, so every
        // "needs your decision" notification about it is now stale — for the
        // actor and for their fellow approvers at that stage alike.
        $this->retireAwaitingNotifications($requestId);

        $row = $this->requestModel->findDetailed($requestId);
        if (!$row) {
            return;
        }

        $this->notifyRequester($row, $notifyStatus, $comment, $nextStage, $stage);

        // Only an advance hands the request to someone new.
        if ($nextStage !== null) {
            $this->notifyStageReviewers($row, $nextStage, $actor);
        }
    }

    /**
     * Tell the people who hold the permission for $stage that something is now
     * waiting on them. Without this, a multi-stage chain is invisible: the
     * request sits in a queue nobody has been told to look at.
     */
    private function notifyStageReviewers(array $row, array $stage, array $actor): void
    {
        $days  = $this->prettyDays($row);
        $dates = $this->prettyRange($row);

        NotificationService::pushToPermissionHolders(
            (string) $stage['required_permission_slug'],
            'LEAVE_AWAITING_DECISION',
            'Leave request needs your decision',
            "{$row['employee_name']} · {$row['leave_type_name']} · {$dates} ({$days} working day"
                . ($days === '1' ? '' : 's') . ") is waiting at \"{$stage['stage_label']}\".",
            '/hr/leave/approvals',
            'leave_request',
            (int) $row['id'],
            'warning',
            // Never notify the person who just acted, nor the requester —
            // an approver filing their own leave must not be nudged to approve it.
            array_filter([(int) ($actor['id'] ?? 0), (int) ($row['user_id'] ?? 0)])
        );
    }

    /**
     * Retire the "awaiting your decision" notifications for a request once it
     * has moved on. Best-effort: a stale badge is a nuisance, not a reason to
     * fail a decision that is already recorded.
     */
    private function retireAwaitingNotifications(int $requestId): void
    {
        try {
            (new NotificationModel())->retireEntityNotifications(
                'leave_request',
                $requestId,
                'LEAVE_AWAITING_DECISION'
            );
        } catch (\Throwable $e) {
            error_log('[LeaveApprovalService] retiring notifications failed: ' . $e->getMessage());
        }
    }

    /** "5" / "4.5" — days without a trailing ".0". */
    private function prettyDays(array $row): string
    {
        return rtrim(rtrim(number_format((float) $row['days_requested'], 1), '0'), '.');
    }

    /** "3 Mar 2030 → 7 Mar 2030", falling back to the raw values. */
    private function prettyRange(array $row): string
    {
        try {
            return (new \DateTimeImmutable((string) $row['start_date']))->format('j M Y')
                . ' → ' . (new \DateTimeImmutable((string) $row['end_date']))->format('j M Y');
        } catch (\Exception) {
            return (string) $row['start_date'] . ' → ' . (string) $row['end_date'];
        }
    }

    /**
     * The login to notify about a request.
     *
     * Self-service requests carry users.id directly. A request HR filed on
     * behalf of an employee has no user_id, but the employee usually still has
     * a login — reached through employees.user_id, exactly how
     * LeaveRequestModel resolves `requester_email`. Without this second hop the
     * two channels disagree: the email goes out and the in-system notification
     * silently does not.
     */
    private function requesterLoginId(array $row): int
    {
        $userId = (int) ($row['user_id'] ?? 0);
        if ($userId > 0) {
            return $userId;
        }

        $employeeId = (int) ($row['employee_id'] ?? 0);
        if ($employeeId <= 0) {
            return 0;
        }

        $found = $this->db->fetchOne(
            "SELECT user_id FROM employees WHERE employee_id = ? LIMIT 1",
            [$employeeId]
        );

        return (int) ($found['user_id'] ?? 0);
    }

    /**
     * Which employee record, if any, belongs to a login. Used so self-service
     * leave still debits a balance.
     */
    private function resolveEmployeeIdForUser(int $userId): ?int
    {
        $row = $this->db->fetchOne(
            "SELECT employee_id FROM employees WHERE user_id = ? LIMIT 1",
            [$userId]
        );

        return $row && !empty($row['employee_id']) ? (int) $row['employee_id'] : null;
    }

    /** Count business days (Mon–Fri) between two dates, inclusive. */
    public function calcBusinessDays(string $start, string $end): float
    {
        try {
            $s = new \DateTimeImmutable($start);
            $e = new \DateTimeImmutable($end);
        } catch (\Exception) {
            throw new \RuntimeException('Start and end date must both be valid dates.');
        }

        if ($s > $e) {
            return 0.0;
        }

        $days = 0;
        for ($cur = $s; $cur <= $e; $cur = $cur->modify('+1 day')) {
            if ((int) $cur->format('N') <= 5) {
                $days++;
            }
        }

        return (float) $days;
    }

    /**
     * Debit ($sign = +1) or credit ($sign = -1) the requester's balance for the
     * request's leave type and start year, creating the row if absent.
     * No-op for a request with no employee record to bill.
     */
    private function adjustBalance(array $row, int $sign): void
    {
        $empId = (int) ($row['employee_id'] ?? 0);
        if ($empId <= 0) {
            return;
        }

        $typeId = (int) $row['leave_type_id'];
        $days   = (float) $row['days_requested'];
        // Bill the year the leave falls in, not the year it was decided in — a
        // December decision on January leave belongs to January's allowance.
        $year   = (int) date('Y', strtotime((string) $row['start_date']) ?: time());
        $type   = $this->typeModel->find($typeId);

        $this->db->execute(
            "INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days)
             VALUES (?, ?, ?, ?, 0)
             ON DUPLICATE KEY UPDATE id = id",
            [$empId, $typeId, $year, (float) ($type['days_allowed'] ?? 0)]
        );

        $this->db->execute(
            "UPDATE leave_balances
             SET used_days = GREATEST(0, used_days + ?)
             WHERE employee_id = ? AND leave_type_id = ? AND year = ?",
            [$sign * $days, $empId, $typeId, $year]
        );
    }

    /**
     * Tell the requester where their request stands, on both channels: an email
     * (with the whole approval chain rendered, so they can see the progress
     * without logging in) and an in-system notification (so the answer is
     * waiting for them when they do).
     *
     * Never throws — a delivery failure must not undo a recorded decision.
     */
    private function notifyRequester(
        array $row,
        string $status,
        string $comment = '',
        ?array $nextStage = null,
        ?array $stage = null
    ): void {
        $view = $this->statusPresentation($row, $status, $nextStage, $stage);

        $this->pushRequesterNotification($row, $status, $comment, $view);
        $this->emailRequester($row, $status, $comment, $view);
    }

    /**
     * One place that decides how a status reads, so the email and the in-system
     * notification can never describe the same event differently.
     *
     * @return array{title:string,color:string,severity:string,lead:string,status_label:string,short:string}
     */
    private function statusPresentation(array $row, string $status, ?array $nextStage, ?array $stage): array
    {
        $stageLbl = (string) ($stage['stage_label'] ?? '');
        $nextLbl  = (string) ($nextStage['stage_label'] ?? '');
        $current  = (string) ($row['current_stage_label'] ?? '');
        $waitingOn = $nextLbl ?: $current ?: $stageLbl ?: 'the first reviewer';

        return match ($status) {
            'Submitted' => [
                'title'        => 'Leave Request Received',
                'color'        => '#1e40af',
                'severity'     => 'info',
                'lead'         => 'We have received your leave request. It is now with <strong>' . htmlspecialchars($waitingOn) . '</strong>.',
                'status_label' => 'Under Review',
                'short'        => "Submitted — now with {$waitingOn}.",
            ],
            'Resubmitted' => [
                'title'        => 'Leave Request Resubmitted',
                'color'        => '#1e40af',
                'severity'     => 'info',
                'lead'         => 'Thanks — your updated leave request is back under review with <strong>' . htmlspecialchars($waitingOn) . '</strong>.',
                'status_label' => 'Under Review',
                'short'        => "Resubmitted — back with {$waitingOn}.",
            ],
            'StageApproved' => [
                'title'        => 'Leave Request Advanced',
                'color'        => '#0369a1',
                'severity'     => 'info',
                'lead'         => 'Your leave request cleared the <strong>' . htmlspecialchars($stageLbl) . '</strong> stage and is now with <strong>' . htmlspecialchars($nextLbl) . '</strong>.',
                'status_label' => 'Under Review',
                'short'        => "Cleared {$stageLbl} — now with {$nextLbl}.",
            ],
            'Approved' => [
                'title'        => 'Leave Approved',
                'color'        => '#059669',
                'severity'     => 'success',
                'lead'         => 'Good news — your leave request has been <strong style="color:#059669">approved</strong>.',
                'status_label' => 'Approved',
                'short'        => 'Approved — your leave is granted.',
            ],
            'Rejected' => [
                'title'        => 'Leave Request Rejected',
                'color'        => '#dc2626',
                'severity'     => 'danger',
                'lead'         => 'Your leave request was <strong style="color:#dc2626">rejected</strong> at the <strong>' . htmlspecialchars($stageLbl) . '</strong> stage.',
                'status_label' => 'Rejected',
                'short'        => "Rejected at {$stageLbl}.",
            ],
            'ChangesRequested' => [
                'title'        => 'Action Needed On Your Leave Request',
                'color'        => '#d97706',
                'severity'     => 'warning',
                'lead'         => 'The reviewer at the <strong>' . htmlspecialchars($stageLbl) . '</strong> stage has asked for changes before this can proceed. Update the request from your staff portal and resubmit it — it goes straight back to the same reviewer.',
                'status_label' => 'Changes Requested',
                'short'        => "Changes requested at {$stageLbl} — update and resubmit.",
            ],
            'Cancelled' => [
                'title'        => 'Leave Request Cancelled',
                'color'        => '#d97706',
                'severity'     => 'warning',
                'lead'         => 'Your leave request has been <strong style="color:#d97706">cancelled</strong>.',
                'status_label' => 'Cancelled',
                'short'        => 'Cancelled.',
            ],
            default => [
                'title'        => 'Leave Request Updated',
                'color'        => '#1e40af',
                'severity'     => 'info',
                'lead'         => 'Your leave request status is now <strong>' . htmlspecialchars($status) . '</strong>.',
                'status_label' => $status,
                'short'        => "Status: {$status}.",
            ],
        };
    }

    /** The in-system half of a status change. */
    private function pushRequesterNotification(array $row, string $status, string $comment, array $view): void
    {
        $userId = $this->requesterLoginId($row);
        if ($userId <= 0) {
            // A legacy employee record with no login account at all — email
            // (which resolves the same way) is the only channel available.
            return;
        }

        $message = "{$row['leave_type_name']} · " . $this->prettyRange($row)
            . ' (' . $this->prettyDays($row) . ' working days) — ' . $view['short'];

        if (trim($comment) !== '') {
            $message .= ' Reviewer note: “' . trim($comment) . '”';
        }

        NotificationService::push(
            $userId,
            'LEAVE_' . strtoupper(preg_replace('/[^A-Za-z]/', '_', $status) ?? 'UPDATE'),
            $view['title'],
            $message,
            '/me/leave',
            'leave_request',
            (int) $row['id'],
            $view['severity']
        );
    }

    /** The email half of a status change, including the rendered chain. */
    private function emailRequester(array $row, string $status, string $comment, array $view): void
    {
        if (empty($row['requester_email'])) {
            // Legacy employee-only requests have no address on record.
            return;
        }

        $name     = htmlspecialchars((string) ($row['employee_name'] ?: 'there'));
        $typeName = htmlspecialchars((string) ($row['leave_type_name'] ?? 'Leave'));
        $days     = $this->prettyDays($row);
        $range    = htmlspecialchars($this->prettyRange($row));

        $commentHtml = '';
        if (trim($comment) !== '') {
            $label = in_array($status, ['Rejected', 'ChangesRequested'], true) ? 'Reason' : 'Note from reviewer';
            $commentHtml = "<p style='margin:14px 0 0 0;'><strong>{$label}:</strong> " . htmlspecialchars(trim($comment)) . '</p>';
        }

        $actionHtml = '';
        if ($status === 'ChangesRequested') {
            $actionHtml = "
                <p style='margin:18px 0 0 0;padding:12px 14px;background-color:#fffbeb;border-left:4px solid #d97706;border-radius:6px;'>
                    <strong>What to do next:</strong> open <em>My Leave</em> in your staff portal, choose
                    &ldquo;Fix &amp; Resubmit&rdquo; on this request, make the change and send it back.
                </p>";
        }

        $content = "
            Dear {$name},<br><br>
            {$view['lead']}<br><br>
            <div style='background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;margin:18px 0;'>
                <p style='margin:0 0 6px 0;'><strong>Leave type:</strong> {$typeName}</p>
                <p style='margin:0 0 6px 0;'><strong>Dates:</strong> {$range}</p>
                <p style='margin:0 0 6px 0;'><strong>Working days:</strong> {$days}</p>
                <p style='margin:0;'><strong>Status:</strong> <span style='color:{$view['color']};font-weight:700;'>{$view['status_label']}</span></p>
                {$commentHtml}
            </div>
            " . $this->renderChainHtml($row) . "
            {$actionHtml}
            <p style='margin:18px 0 0 0;'>You can follow this request's approval progress any time from your staff portal.</p>
        ";

        try {
            (new MailService())->send(
                ['email' => $row['requester_email'], 'name' => (string) $row['employee_name']],
                $view['title'],
                EmailTemplateHelper::wrap($view['title'], $content)
            );
        } catch (\Throwable $e) {
            error_log('[LeaveApprovalService] notification email failed: ' . $e->getMessage());
        }
    }

    /**
     * "Signed by J. Bosco (VC) &middot; 4 Mar" — a cleared step reads as the
     * signature block it is, matching the wording on the authorisation form.
     */
    private function signatureNote(array $step): string
    {
        $parts = [];

        // The outcome step records a result, not somebody's signature.
        if (($step['key'] ?? '') === 'granted') {
            $parts[] = 'Granted';
        } elseif (!empty($step['actor'])) {
            $who = htmlspecialchars((string) $step['actor']);
            if (!empty($step['actor_role'])) {
                $who .= ' (' . htmlspecialchars((string) $step['actor_role']) . ')';
            }
            $parts[] = 'Signed by ' . $who;
        } else {
            $parts[] = 'Signed';
        }


        if (!empty($step['decided_at'])) {
            try {
                $parts[] = (new \DateTimeImmutable((string) $step['decided_at']))->format('j M H:i');
            } catch (\Exception) {
                // Leave the date off rather than printing a raw timestamp.
            }
        }

        return implode(' &middot; ', $parts);
    }

    /** The awaiting step reports its wait against the stage's SLA. */
    private function awaitingNote(array $step): string
    {
        $waiting = (int) ($step['hours_waiting'] ?? 0);
        $sla     = $step['sla_hours'] !== null ? (int) $step['sla_hours'] : null;

        if (!empty($step['is_overdue']) && $sla !== null) {
            return 'Awaiting decision &mdash; ' . ($waiting - $sla) . 'h over target';
        }
        if ($sla !== null) {
            return "Awaiting decision &middot; {$waiting}h of {$sla}h";
        }

        return 'Awaiting decision';
    }

    /** A step not yet reached advertises its target, if it has one. */
    private function slaNote(array $step): string
    {
        return $step['sla_hours'] !== null
            ? 'Target ' . (int) $step['sla_hours'] . 'h'
            : 'Not started';
    }

    /**
     * The approval chain as an email-safe table — every stage, with the one it
     * is sitting at called out. Email clients are hostile to flexbox and
     * pseudo-elements, so this is a plain table with inline styles only.
     */
    private function renderChainHtml(array $row): string
    {
        $steps = $this->buildSteps($row);

        $rowsHtml = '';
        foreach ($steps as $i => $step) {
            [$mark, $markColor, $note] = match ($step['state']) {
                'completed'         => ['&#10003;', '#059669', $this->signatureNote($step)],
                'current'           => ['&#9679;',  '#d97706', $this->awaitingNote($step)],
                'rejected'          => ['&#10007;', '#dc2626', 'Rejected here'],
                'changes_requested' => ['&#8635;',  '#d97706', 'Changes requested here'],
                'cancelled'         => ['&#10007;', '#6b7280', 'Cancelled here'],
                'skipped'           => ['&#8211;',  '#9ca3af', 'Not reached'],
                default             => [(string) ($i + 1), '#9ca3af', $this->slaNote($step)],
            };

            $isCurrent = $step['state'] === 'current';
            $weight    = $isCurrent ? '700' : '400';
            $textColor = $isCurrent ? '#0f172a' : '#475569';

            $rowsHtml .= "
                <tr>
                    <td style='padding:6px 10px 6px 0;width:22px;color:{$markColor};font-weight:700;font-size:14px;line-height:1.4;vertical-align:top;'>{$mark}</td>
                    <td style='padding:6px 0;font-size:13px;color:{$textColor};font-weight:{$weight};line-height:1.4;'>"
                        . htmlspecialchars((string) $step['label']) .
                    "</td>
                    <td style='padding:6px 0 6px 10px;font-size:11px;color:#94a3b8;text-align:right;white-space:nowrap;vertical-align:top;'>{$note}</td>
                </tr>";
        }

        return "
            <p style='margin:0 0 8px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;'>
                Approval progress
            </p>
            <table role='presentation' cellpadding='0' cellspacing='0' border='0' style='width:100%;border-collapse:collapse;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:8px 16px;'>
                {$rowsHtml}
            </table>";
    }
}
