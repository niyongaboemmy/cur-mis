<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Services\ServiceRequestService;
use App\Models\ServiceRequestModel;
use App\Models\ServiceRequestApprovalModel;
use App\Constants\Permissions;
use App\Helpers\ValidationHelper;

class ServiceRequestApprovalController extends BaseController
{
    private ServiceRequestService       $service;
    private ServiceRequestModel         $requestModel;
    private ServiceRequestApprovalModel $approvalModel;

    private const STAGE_PERMISSIONS = [
        Permissions::APPROVE_SERVICE_REQUEST_L1,
        Permissions::APPROVE_SERVICE_REQUEST_L2,
        Permissions::APPROVE_SERVICE_REQUEST_FINAL,
    ];

    public function __construct()
    {
        $this->service       = new ServiceRequestService();
        $this->requestModel  = new ServiceRequestModel();
        $this->approvalModel = new ServiceRequestApprovalModel();
    }

    /** A queue may serve multiple stage permissions — return every stage the actor holds. */
    public function queue(Request $request, Response $response): never
    {
        $authUser = (array)$request->param('_auth_user');
        $perms    = (array)($authUser['permissions'] ?? []);

        $isSuperadmin = strtolower((string)($authUser['role'] ?? '')) === 'superadmin';
        $heldPermissions = $isSuperadmin ? self::STAGE_PERMISSIONS : array_values(array_intersect(self::STAGE_PERMISSIONS, $perms));

        if (empty($heldPermissions)) {
            $this->success($response, [], 'No approval stages assigned to your role.');
        }

        $rows = [];
        foreach ($heldPermissions as $slug) {
            for ($stageOrder = 1; $stageOrder <= 10; $stageOrder++) {
                $matches = $this->service->queueForActor($stageOrder, $slug);
                if (!empty($matches)) {
                    $rows = array_merge($rows, $matches);
                }
            }
        }

        $this->success($response, $rows, 'Approval queue fetched successfully.');
    }

    public function decide(Request $request, Response $response): never
    {
        $id   = (int)$request->param('id');
        $body = $request->body();

        $errors = ValidationHelper::validate($body, [
            'decision' => ['required', 'in:approved,rejected,changes_requested'],
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $authUser = (array)$request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);
        $isSuperadmin = strtolower((string)($authUser['role'] ?? '')) === 'superadmin';
        $perms    = $isSuperadmin ? self::STAGE_PERMISSIONS : (array)($authUser['permissions'] ?? []);

        try {
            $updated = $this->service->decide(
                $id,
                (string)$body['decision'],
                $perms,
                $actorId,
                (string)($authUser['full_name'] ?? ''),
                (string)($authUser['role'] ?? ''),
                $body['comment'] ?? null
            );
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $updated, 'Decision recorded successfully.');
    }
}
