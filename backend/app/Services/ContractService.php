<?php

declare(strict_types=1);

namespace App\Services;

use Exception;

/**
 * Contract Service
 *
 * Handles employee contract management, renewals, and expiry tracking
 */
class ContractService
{
    private $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    /**
     * Get all contracts with status
     *
     * @param int $limit
     * @param int $offset
     * @return array
     */
    public function getContracts(int $limit = 50, int $offset = 0): array
    {
        $query = $this->db->table('employee_contracts ec')
            ->select([
                'ec.id',
                'ec.user_id',
                'u.full_name',
                'u.username',
                'd.name as department',
                'ct.name as contract_type',
                'ec.contract_number',
                'ec.start_date',
                'ec.end_date',
                'ec.position_title',
                'ec.employment_level',
                'ec.status',
                'ec.renewal_due_date',
                'ec.created_at',
            ])
            ->join('users u', 'u.id = ec.user_id')
            ->join('contract_types ct', 'ct.id = ec.contract_type_id')
            ->leftJoin('departments d', 'd.id = ec.department_id')
            ->orderBy('ec.start_date', 'DESC');

        $total = $query->countAllResults();
        $results = $query->limit($limit, $offset)->get()->getResultArray();

        // Add renewal status
        foreach ($results as &$contract) {
            $contract['renewal_status'] = $this->getContractStatus($contract);
        }

        return [
            'data' => $results,
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
        ];
    }

    /**
     * Get contract details
     *
     * @param int $id
     * @return array|null
     */
    public function getContract(int $id): ?array
    {
        $contract = $this->db->table('employee_contracts ec')
            ->select('ec.*')
            ->join('contract_types ct', 'ct.id = ec.contract_type_id')
            ->where('ec.id', $id)
            ->get()
            ->getRowArray();

        if (!$contract) {
            return null;
        }

        $contract['renewal_status'] = $this->getContractStatus($contract);
        $contract['notifications'] = $this->getContractNotifications($id);

        return $contract;
    }

    /**
     * Get contract status based on dates
     *
     * @param array $contract
     * @return string
     */
    private function getContractStatus(array $contract): string
    {
        $today = date('Y-m-d');
        $endDate = $contract['end_date'];
        $renewalDueDate = $contract['renewal_due_date'];

        if (empty($endDate)) {
            return 'Active (Indefinite)';
        }

        if ($endDate < $today) {
            return 'EXPIRED';
        }

        if ($renewalDueDate && $renewalDueDate <= $today) {
            return 'RENEWAL DUE';
        }

        if (strtotime($endDate) - strtotime($today) <= 30 * 24 * 60 * 60) {
            return 'EXPIRING SOON (30 days)';
        }

        return 'ACTIVE';
    }

    /**
     * Get contract types
     *
     * @return array
     */
    public function getContractTypes(): array
    {
        return $this->db->table('contract_types')
            ->where('is_active', 1)
            ->orderBy('sort_order', 'ASC')
            ->get()
            ->getResultArray();
    }

    /**
     * Create or update contract
     *
     * @param array $data
     * @return int Contract ID
     * @throws Exception
     */
    public function saveContract(array $data): int
    {
        try {
            $id = $data['id'] ?? null;

            $contractData = [
                'user_id' => $data['user_id'] ?? null,
                'contract_type_id' => $data['contract_type_id'] ?? null,
                'contract_number' => $data['contract_number'] ?? null,
                'start_date' => $data['start_date'] ?? null,
                'end_date' => $data['end_date'] ?? null,
                'position_title' => $data['position_title'] ?? null,
                'department_id' => $data['department_id'] ?? null,
                'faculty_id' => $data['faculty_id'] ?? null,
                'employment_level' => $data['employment_level'] ?? null,
                'reporting_to_id' => $data['reporting_to_id'] ?? null,
                'salary_grade' => $data['salary_grade'] ?? null,
                'status' => $data['status'] ?? 'Draft',
            ];

            // Calculate renewal due date
            if ($data['end_date'] ?? null) {
                $contractType = $this->db->table('contract_types')
                    ->where('id', $data['contract_type_id'])
                    ->get()
                    ->getRowArray();

                if ($contractType && $contractType['renewal_notice_days']) {
                    $renewalDueDate = date('Y-m-d', strtotime("-{$contractType['renewal_notice_days']} days", strtotime($data['end_date'])));
                    $contractData['renewal_due_date'] = $renewalDueDate;
                }
            }

            if ($id) {
                $this->db->table('employee_contracts')
                    ->where('id', $id)
                    ->update($contractData);
            } else {
                $this->db->table('employee_contracts')
                    ->insert($contractData);
                $id = $this->db->insertID();
            }

            return $id;

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Approve contract
     *
     * @param int $contractId
     * @param int $approvedBy
     * @return bool
     * @throws Exception
     */
    public function approveContract(int $contractId, int $approvedBy): bool
    {
        try {
            $this->db->table('employee_contracts')
                ->where('id', $contractId)
                ->update([
                    'status' => 'Active',
                    'approved_by' => $approvedBy,
                    'approved_at' => date('Y-m-d H:i:s'),
                ]);

            return true;

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Renew contract
     *
     * @param int $contractId
     * @param string $newEndDate
     * @param int $renewedBy
     * @return int New contract ID
     * @throws Exception
     */
    public function renewContract(int $contractId, string $newEndDate, int $renewedBy): int
    {
        try {
            $contract = $this->getContract($contractId);

            if (!$contract) {
                throw new Exception('Contract not found');
            }

            // Update original contract with renewed flag
            $this->db->table('employee_contracts')
                ->where('id', $contractId)
                ->update([
                    'renewed_at' => date('Y-m-d H:i:s'),
                ]);

            // Create new contract
            $newContractData = $contract;
            unset($newContractData['id']);
            $newContractData['start_date'] = date('Y-m-d', strtotime('+1 day', strtotime($contract['end_date'] ?? 'today')));
            $newContractData['end_date'] = $newEndDate;
            $newContractData['status'] = 'Draft';
            $newContractData['renewed_at'] = null;
            $newContractData['approved_at'] = null;
            $newContractData['approved_by'] = null;

            // Calculate new renewal due date
            $contractType = $this->db->table('contract_types')
                ->where('id', $contract['contract_type_id'])
                ->get()
                ->getRowArray();

            if ($contractType && $contractType['renewal_notice_days']) {
                $newContractData['renewal_due_date'] = date('Y-m-d', strtotime("-{$contractType['renewal_notice_days']} days", strtotime($newEndDate)));
            }

            $this->db->table('employee_contracts')
                ->insert($newContractData);

            $newContractId = $this->db->insertID();

            // Send notification
            $this->sendContractNotification($contractId, 'Renewal Approved', "Contract for {$contract['full_name']} has been renewed until {$newEndDate}");

            return $newContractId;

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Terminate contract
     *
     * @param int $contractId
     * @param string $terminationDate
     * @param string $reason
     * @param int $terminatedBy
     * @return bool
     * @throws Exception
     */
    public function terminateContract(int $contractId, string $terminationDate, string $reason, int $terminatedBy): bool
    {
        try {
            $this->db->table('employee_contracts')
                ->where('id', $contractId)
                ->update([
                    'status' => 'Terminated',
                    'termination_date' => $terminationDate,
                    'termination_reason' => $reason,
                ]);

            $contract = $this->getContract($contractId);
            if ($contract) {
                $this->sendContractNotification($contractId, 'Termination', "Contract terminated: {$reason}");
            }

            return true;

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Get contracts due for renewal
     *
     * @param int $daysAhead How many days ahead to check (e.g., 30)
     * @return array
     */
    public function getContractsForRenewal(int $daysAhead = 30): array
    {
        $today = date('Y-m-d');
        $futureDate = date('Y-m-d', strtotime("+{$daysAhead} days"));

        return $this->db->table('employee_contracts ec')
            ->select([
                'ec.id',
                'ec.user_id',
                'u.full_name',
                'u.username',
                'd.name as department',
                'ct.name as contract_type',
                'ec.start_date',
                'ec.end_date',
                'ec.renewal_due_date',
                'ec.position_title',
            ])
            ->join('users u', 'u.id = ec.user_id')
            ->join('contract_types ct', 'ct.id = ec.contract_type_id')
            ->leftJoin('departments d', 'd.id = ec.department_id')
            ->where('ec.status', 'Active')
            ->where('ec.renewal_due_date >=', $today)
            ->where('ec.renewal_due_date <=', $futureDate)
            ->orWhere('ec.status', 'Active')
            ->where('ec.end_date >=', $today)
            ->where('ec.end_date <=', $futureDate)
            ->orderBy('ec.renewal_due_date', 'ASC')
            ->get()
            ->getResultArray();
    }

    /**
     * Get contracts that have expired
     *
     * @return array
     */
    public function getExpiredContracts(): array
    {
        $today = date('Y-m-d');

        return $this->db->table('employee_contracts ec')
            ->select([
                'ec.id',
                'ec.user_id',
                'u.full_name',
                'u.username',
                'd.name as department',
                'ct.name as contract_type',
                'ec.end_date',
                'ec.status',
            ])
            ->join('users u', 'u.id = ec.user_id')
            ->join('contract_types ct', 'ct.id = ec.contract_type_id')
            ->leftJoin('departments d', 'd.id = ec.department_id')
            ->where('ec.end_date <', $today)
            ->where('ec.status !=', 'Terminated')
            ->orderBy('ec.end_date', 'ASC')
            ->get()
            ->getResultArray();
    }

    /**
     * Get employee's current contract
     *
     * @param int $userId
     * @return array|null
     */
    public function getEmployeeCurrentContract(int $userId): ?array
    {
        return $this->db->table('employee_contracts ec')
            ->select('ec.*')
            ->where('ec.user_id', $userId)
            ->where('ec.status', 'Active')
            ->orderBy('ec.start_date', 'DESC')
            ->get()
            ->getRowArray();
    }

    /**
     * Get contract history for employee
     *
     * @param int $userId
     * @return array
     */
    public function getEmployeeContractHistory(int $userId): array
    {
        return $this->db->table('employee_contracts ec')
            ->select([
                'ec.id',
                'ec.contract_number',
                'ct.name as contract_type',
                'ec.start_date',
                'ec.end_date',
                'ec.status',
                'ec.created_at',
            ])
            ->join('contract_types ct', 'ct.id = ec.contract_type_id')
            ->where('ec.user_id', $userId)
            ->orderBy('ec.start_date', 'DESC')
            ->get()
            ->getResultArray();
    }

    /**
     * Get contract notifications
     *
     * @param int $contractId
     * @return array
     */
    public function getContractNotifications(int $contractId): array
    {
        return $this->db->table('contract_notifications')
            ->where('contract_id', $contractId)
            ->orderBy('notification_date', 'DESC')
            ->get()
            ->getResultArray();
    }

    /**
     * Send contract notification
     *
     * @param int $contractId
     * @param string $type
     * @param string $message
     * @return void
     */
    private function sendContractNotification(int $contractId, string $type, string $message): void
    {
        $contract = $this->db->table('employee_contracts')
            ->where('id', $contractId)
            ->select('user_id')
            ->get()
            ->getRowArray();

        if ($contract) {
            $this->db->table('contract_notifications')
                ->insert([
                    'contract_id' => $contractId,
                    'notification_type' => $type,
                    'recipient_id' => $contract['user_id'],
                    'message' => $message,
                    'notification_date' => date('Y-m-d'),
                ]);
        }
    }

    /**
     * Get contracts by status for dashboard
     *
     * @return array
     */
    public function getContractSummary(): array
    {
        $today = date('Y-m-d');
        $thirtyDaysFromNow = date('Y-m-d', strtotime('+30 days'));

        $active = $this->db->table('employee_contracts')
            ->where('status', 'Active')
            ->where('end_date >', $today)
            ->countAllResults();

        $renewalDue = $this->db->table('employee_contracts')
            ->where('status', 'Active')
            ->where('renewal_due_date >=', $today)
            ->where('renewal_due_date <=', $thirtyDaysFromNow)
            ->countAllResults();

        $expiringSoon = $this->db->table('employee_contracts')
            ->where('status', 'Active')
            ->where('end_date >=', $today)
            ->where('end_date <=', $thirtyDaysFromNow)
            ->countAllResults();

        $expired = $this->db->table('employee_contracts')
            ->where('end_date <', $today)
            ->where('status !=', 'Terminated')
            ->countAllResults();

        return [
            'active_contracts' => $active,
            'renewal_due' => $renewalDue,
            'expiring_soon' => $expiringSoon,
            'expired' => $expired,
        ];
    }
}
