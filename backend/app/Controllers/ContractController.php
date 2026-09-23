<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\ContractService;
use App\Helpers\ResponseHelper;

/**
 * Contract Controller
 *
 * Handles employee contract management and renewals
 */
class ContractController extends BaseController
{
    private ContractService $contractService;

    public function __construct()
    {
        parent::__construct();
        $this->contractService = new ContractService();
    }

    /**
     * GET /api/hr/contracts
     * Get all contracts
     *
     * @return void
     */
    public function getContracts(): void
    {
        try {
            $page = max(1, (int) ($_GET['page'] ?? 1));
            $limit = min(100, max(10, (int) ($_GET['limit'] ?? 20)));
            $offset = ($page - 1) * $limit;

            $result = $this->contractService->getContracts($limit, $offset);

            ResponseHelper::success($result);

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/contracts/:id
     * Get contract details
     *
     * @param int $id
     * @return void
     */
    public function getContract(int $id): void
    {
        try {
            $contract = $this->contractService->getContract($id);

            if (!$contract) {
                ResponseHelper::error('Contract not found', 404);
                return;
            }

            ResponseHelper::success($contract);

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * POST /api/hr/contracts
     * Create or update contract
     *
     * @return void
     */
    public function saveContract(): void
    {
        try {
            $data = json_decode(file_get_contents('php://input'), true);

            if (empty($data['user_id']) || empty($data['contract_type_id'])) {
                ResponseHelper::error('Employee and contract type are required', 400);
                return;
            }

            $id = $this->contractService->saveContract($data);

            ResponseHelper::success(['id' => $id], 'Contract saved');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * POST /api/hr/contracts/:id/approve
     * Approve contract
     *
     * @param int $id
     * @return void
     */
    public function approveContract(int $id): void
    {
        try {
            $userId = $this->user['id'] ?? null;

            $this->contractService->approveContract($id, $userId);

            ResponseHelper::success(null, 'Contract approved');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/hr/contracts/:id/renew
     * Renew contract
     *
     * @param int $id
     * @return void
     */
    public function renewContract(int $id): void
    {
        try {
            $data = json_decode(file_get_contents('php://input'), true);

            if (empty($data['new_end_date'])) {
                ResponseHelper::error('New end date is required', 400);
                return;
            }

            $userId = $this->user['id'] ?? null;
            $newId = $this->contractService->renewContract($id, $data['new_end_date'], $userId);

            ResponseHelper::success(['id' => $newId], 'Contract renewed');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/hr/contracts/:id/terminate
     * Terminate contract
     *
     * @param int $id
     * @return void
     */
    public function terminateContract(int $id): void
    {
        try {
            $data = json_decode(file_get_contents('php://input'), true);

            if (empty($data['termination_date']) || empty($data['reason'])) {
                ResponseHelper::error('Termination date and reason are required', 400);
                return;
            }

            $userId = $this->user['id'] ?? null;

            $this->contractService->terminateContract(
                $id,
                $data['termination_date'],
                $data['reason'],
                $userId
            );

            ResponseHelper::success(null, 'Contract terminated');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/hr/contracts/types
     * Get contract types
     *
     * @return void
     */
    public function getContractTypes(): void
    {
        try {
            $types = $this->contractService->getContractTypes();

            ResponseHelper::success($types);

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/contracts/renewal/pending
     * Get contracts pending renewal
     *
     * @return void
     */
    public function getPendingRenewals(): void
    {
        try {
            $daysAhead = (int) ($_GET['days'] ?? 30);

            $contracts = $this->contractService->getContractsForRenewal($daysAhead);

            ResponseHelper::success($contracts);

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/contracts/expired
     * Get expired contracts
     *
     * @return void
     */
    public function getExpiredContracts(): void
    {
        try {
            $contracts = $this->contractService->getExpiredContracts();

            ResponseHelper::success($contracts);

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/contracts/employee/:userId
     * Get employee's current contract
     *
     * @param int $userId
     * @return void
     */
    public function getEmployeeContract(int $userId): void
    {
        try {
            $contract = $this->contractService->getEmployeeCurrentContract($userId);

            if (!$contract) {
                ResponseHelper::error('No active contract found', 404);
                return;
            }

            ResponseHelper::success($contract);

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/contracts/employee/:userId/history
     * Get employee's contract history
     *
     * @param int $userId
     * @return void
     */
    public function getEmployeeContractHistory(int $userId): void
    {
        try {
            $history = $this->contractService->getEmployeeContractHistory($userId);

            ResponseHelper::success($history);

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/contracts/summary
     * Get contract summary for dashboard
     *
     * @return void
     */
    public function getContractSummary(): void
    {
        try {
            $summary = $this->contractService->getContractSummary();

            ResponseHelper::success($summary);

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }
}
