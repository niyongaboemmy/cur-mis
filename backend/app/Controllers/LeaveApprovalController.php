<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Services\LeaveApprovalService;
use App\Services\AuthService;
use App\Services\NotificationService;
use App\Models\LeaveTypeModel;
use App\Constants\Permissions;
use App\Helpers\ValidationHelper;

/**
 * Stage-based leave approvals — the queue, the decision endpoint, the audit
 * trail, and the chain configuration.
 *
 * Direct counterpart of ServiceRequestApprovalController: the route layer gates
 * entry on holding *any* stage permission, and the service re-checks that the
 * actor holds the one the request's current stage actually requires.
 */
class LeaveApprovalController extends BaseController
{
    private LeaveApprovalService $service;
    private LeaveTypeModel       $typeModel;

    public function __construct()
    {
        $this->service   = new LeaveApprovalService();
        $this->typeModel = new LeaveTypeModel();
    }

    /**
     * GET /api/hr/leave/approvals/queue
     * Everything parked at a stage this actor is allowed to decide.
     */
    public function queue(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $rows  = $this->service->queueForActor(
            (array) ($actor['permissions'] ?? []),
            AuthService::isSuperadmin($actor)
        );

        $this->success($response, $rows, 'Leave approval queue fetched.');
    }

    /**
     * POST /api/hr/leave/approvals/:id/decide
     * Body: { decision: approved|rejected|changes_requested, comment?: string }
     */
    public function decide(Request $request, Response $response): never
    {
        $id   = (int) $request->param('id');
        $body = $request->body();

        $errors = ValidationHelper::validate($body, [
            'decision' => ['required', 'in:' . implode(',', LeaveApprovalService::DECISIONS)],
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $actor = (array) $request->param('_auth_user');

        try {
            $updated = $this->service->decide(
                $id,
                (string) $body['decision'],
                $this->effectivePermissions($actor),
                $actor,
                $body['comment'] ?? null
            );
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $updated, 'Decision recorded.');
    }

    /**
     * GET /api/hr/leave/requests/:id/progress
     * Stepper + audit trail. Visible to the requester and to leave reviewers.
     */
    public function progress(Request $request, Response $response): never
    {
        $id       = (int) $request->param('id');
        $progress = $this->service->progress($id);

        if (!$progress) {
            $this->error($response, 'Leave request not found.', 404);
        }

        $this->success($response, $progress, 'Leave request progress fetched.');
    }

    /**
     * GET /api/hr/leave/types/:id/stages
     * The configured approval chain for a leave type. Falls back to the
     * implicit single-stage chain when nothing is configured, so the caller
     * always sees what will actually be applied.
     */
    public function stages(Request $request, Response $response): never
    {
        $typeId = (int) $request->param('id');
        if (!$this->typeModel->find($typeId)) {
            $this->error($response, 'Leave type not found.', 404);
        }

        // How many active accounts can actually sign each stage. A stage whose
        // permission nobody holds is a chain that cannot complete, so the editor
        // needs to be able to say so rather than letting requests queue at an
        // empty office.
        $stages = array_map(function (array $stage): array {
            $slug = (string) $stage['required_permission_slug'];
            // Which offices sign this step, and whether anyone is in them.
            $stage['roles']        = NotificationService::rolesWithPermission($slug);
            $stage['holder_count'] = count(NotificationService::usersWithPermission($slug));
            return $stage;
        }, $this->service->chainFor($typeId));

        $this->success($response, [
            'leave_type_id'               => $typeId,
            'stages'                      => $stages,
            'available_stage_permissions' => LeaveApprovalService::STAGE_PERMISSIONS,
            // slug => number of active accounts holding it, for the picker.
            'permission_holder_counts'    => array_combine(
                LeaveApprovalService::STAGE_PERMISSIONS,
                array_map(
                    static fn(string $slug): int => count(NotificationService::usersWithPermission($slug)),
                    LeaveApprovalService::STAGE_PERMISSIONS
                )
            ),
            // slug => the roles holding it, so the picker can name the office
            // rather than only counting heads.
            'permission_roles'            => array_combine(
                LeaveApprovalService::STAGE_PERMISSIONS,
                array_map(
                    static fn(string $slug): array => NotificationService::rolesWithPermission($slug),
                    LeaveApprovalService::STAGE_PERMISSIONS
                )
            ),
        ], 'Approval chain fetched.');
    }

    /**
     * POST /api/hr/leave/types/:id/stages
     * Body: { stages: [{ stage_key, stage_label, required_permission_slug, is_final_approval, sla_hours? }] }
     * Replaces the whole chain — stage_order is assigned from array position.
     */
    public function saveStages(Request $request, Response $response): never
    {
        $typeId = (int) $request->param('id');
        $type   = $this->typeModel->find($typeId);
        if (!$type) {
            $this->error($response, 'Leave type not found.', 404);
        }

        $stages = $request->body()['stages'] ?? null;
        if (!is_array($stages)) {
            $this->error($response, 'A `stages` array is required.', 422);
        }

        try {
            $saved = $this->service->replaceChain($typeId, $stages);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $actor = (array) $request->param('_auth_user');
        \App\Services\SystemLogService::log(
            'UPDATE',
            'HR',
            "Updated the leave approval chain for '{$type['name']}' (" . count($saved) . ' stages).',
            $typeId,
            'leave_type',
            ['stages' => array_column($saved, 'stage_key')],
            $actor ?: null
        );

        $this->success($response, $saved, 'Approval chain saved.');
    }

    /**
     * Superadmin implicitly holds every stage permission, matching how
     * MaybePermissionMiddleware and ServiceRequestApprovalController treat it.
     *
     * @return string[]
     */
    private function effectivePermissions(array $actor): array
    {
        if (AuthService::isSuperadmin($actor)) {
            return array_merge(LeaveApprovalService::STAGE_PERMISSIONS, [Permissions::MANAGE_LEAVE_REQUESTS]);
        }

        return (array) ($actor['permissions'] ?? []);
    }
}
