<?php

declare(strict_types=1);

namespace App\Services;

use Exception;

/**
 * Payroll Service
 *
 * Handles payroll run creation, processing, and employee salary management
 */
class PayrollService
{
    private $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    /**
     * Get all salary structures with component details
     *
     * @param int $limit
     * @param int $offset
     * @return array
     */
    public function getSalaryStructures(int $limit = 50, int $offset = 0): array
    {
        $query = $this->db->table('salary_structures ss')
            ->select([
                'ss.id',
                'ss.name',
                'ss.description',
                'ss.applicable_level',
                'ss.basic_salary_min',
                'ss.basic_salary_max',
                'ss.effective_date',
                'ss.end_date',
                'ss.created_at',
                'ss.updated_at',
            ])
            ->where('ss.end_date IS NULL OR ss.end_date >= CURDATE()')
            ->orderBy('ss.effective_date', 'DESC');

        $total = $query->countAllResults();
        $results = $query->limit($limit, $offset)->get()->getResultArray();

        foreach ($results as &$structure) {
            $structure['components'] = $this->getStructureComponents($structure['id']);
        }

        return [
            'data' => $results,
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
        ];
    }

    /**
     * Get salary structure with all components
     *
     * @param int $id
     * @return array|null
     */
    public function getSalaryStructure(int $id): ?array
    {
        $structure = $this->db->table('salary_structures')
            ->where('id', $id)
            ->get()
            ->getRowArray();

        if (!$structure) {
            return null;
        }

        $structure['components'] = $this->getStructureComponents($id);

        return $structure;
    }

    /**
     * Get components for a salary structure
     *
     * @param int $structureId
     * @return array
     */
    public function getStructureComponents(int $structureId): array
    {
        return $this->db->table('salary_structure_components ssc')
            ->select([
                'ssc.id',
                'ssc.component_type_id',
                'sct.name as component_name',
                'sct.code as component_code',
                'sct.component_type',
                'ssc.percentage',
                'ssc.fixed_amount',
                'ssc.is_percentage',
                'ssc.sort_order',
            ])
            ->join('salary_component_types sct', 'sct.id = ssc.component_type_id')
            ->where('ssc.salary_structure_id', $structureId)
            ->orderBy('ssc.sort_order', 'ASC')
            ->get()
            ->getResultArray();
    }

    /**
     * Create or update salary structure
     *
     * @param array $data
     * @return int Structure ID
     * @throws Exception
     */
    public function saveSalaryStructure(array $data): int
    {
        try {
            $id = $data['id'] ?? null;

            $structureData = [
                'name' => $data['name'] ?? '',
                'description' => $data['description'] ?? null,
                'applicable_level' => $data['applicable_level'] ?? null,
                'basic_salary_min' => $data['basic_salary_min'] ?? null,
                'basic_salary_max' => $data['basic_salary_max'] ?? null,
                'effective_date' => $data['effective_date'] ?? date('Y-m-d'),
                'end_date' => $data['end_date'] ?? null,
            ];

            if ($id) {
                // Update existing
                $this->db->table('salary_structures')
                    ->where('id', $id)
                    ->update($structureData);
            } else {
                // Create new
                $this->db->table('salary_structures')
                    ->insert($structureData);
                $id = $this->db->insertID();
            }

            // Save components if provided
            if (!empty($data['components']) && is_array($data['components'])) {
                // Delete old components
                $this->db->table('salary_structure_components')
                    ->where('salary_structure_id', $id)
                    ->delete();

                // Insert new components
                foreach ($data['components'] as $component) {
                    $this->db->table('salary_structure_components')
                        ->insert([
                            'salary_structure_id' => $id,
                            'component_type_id' => $component['component_type_id'],
                            'percentage' => $component['is_percentage'] ? $component['value'] : null,
                            'fixed_amount' => !$component['is_percentage'] ? $component['value'] : null,
                            'is_percentage' => $component['is_percentage'] ? 1 : 0,
                            'sort_order' => $component['sort_order'] ?? 0,
                        ]);
                }
            }

            return $id;

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Get employee salary assignments
     *
     * @param int $userId
     * @return array|null
     */
    public function getEmployeeSalary(int $userId): ?array
    {
        $assignment = $this->db->table('employee_salary_assignments esa')
            ->select([
                'esa.id',
                'esa.user_id',
                'esa.salary_structure_id',
                'esa.basic_salary',
                'esa.effective_date',
                'esa.end_date',
                'esa.approved_by',
                'esa.approved_at',
                'ss.name as structure_name',
            ])
            ->join('salary_structures ss', 'ss.id = esa.salary_structure_id')
            ->where('esa.user_id', $userId)
            ->where('esa.end_date IS NULL OR esa.end_date >= CURDATE()')
            ->orderBy('esa.effective_date', 'DESC')
            ->get()
            ->getRowArray();

        if (!$assignment) {
            return null;
        }

        // Get detailed structure and calculate components
        $structure = $this->getSalaryStructure($assignment['salary_structure_id']);
        $assignment['structure'] = $structure;
        $assignment['breakdown'] = $this->calculateSalaryBreakdown($assignment['basic_salary'], $structure['components']);

        return $assignment;
    }

    /**
     * Calculate salary breakdown for an employee
     *
     * @param float $basicSalary
     * @param array $components
     * @return array
     */
    public function calculateSalaryBreakdown(float $basicSalary, array $components): array
    {
        $breakdown = [
            'earnings' => [],
            'deductions' => [],
            'statutory' => [],
            'gross_salary' => 0,
            'total_deductions' => 0,
            'net_salary' => 0,
        ];

        foreach ($components as $component) {
            $amount = $this->calculateComponentAmount($basicSalary, $component);

            $entry = [
                'component_id' => $component['component_type_id'],
                'component_name' => $component['component_name'],
                'component_code' => $component['component_code'],
                'amount' => $amount,
            ];

            if ($component['component_type'] === 'Earnings') {
                $breakdown['earnings'][] = $entry;
                $breakdown['gross_salary'] += $amount;
            } elseif ($component['component_type'] === 'Deduction') {
                $breakdown['deductions'][] = $entry;
                $breakdown['total_deductions'] += $amount;
            } elseif ($component['component_type'] === 'Statutory') {
                $breakdown['statutory'][] = $entry;
                $breakdown['total_deductions'] += $amount;
            }
        }

        $breakdown['net_salary'] = $breakdown['gross_salary'] - $breakdown['total_deductions'];

        return $breakdown;
    }

    /**
     * Calculate a single component amount
     *
     * @param float $basicSalary
     * @param array $component
     * @return float
     */
    private function calculateComponentAmount(float $basicSalary, array $component): float
    {
        if ($component['is_percentage']) {
            return ($basicSalary * $component['percentage']) / 100;
        } else {
            return $component['fixed_amount'];
        }
    }

    /**
     * Assign salary structure to employee
     *
     * @param int $userId
     * @param int $structureId
     * @param float $basicSalary
     * @param string $effectiveDate
     * @return int Assignment ID
     * @throws Exception
     */
    public function assignEmployeeSalary(int $userId, int $structureId, float $basicSalary, string $effectiveDate = null): int
    {
        try {
            // End previous assignment
            $this->db->table('employee_salary_assignments')
                ->where('user_id', $userId)
                ->where('end_date IS NULL')
                ->update(['end_date' => date('Y-m-d', strtotime('-1 day', strtotime($effectiveDate ?? 'today')))]);

            // Create new assignment
            $this->db->table('employee_salary_assignments')
                ->insert([
                    'user_id' => $userId,
                    'salary_structure_id' => $structureId,
                    'basic_salary' => $basicSalary,
                    'effective_date' => $effectiveDate ?? date('Y-m-d'),
                ]);

            return $this->db->insertID();

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Get all payroll runs with summary
     *
     * @param int $limit
     * @param int $offset
     * @return array
     */
    public function getPayrollRuns(int $limit = 20, int $offset = 0): array
    {
        $query = $this->db->table('payroll_runs pr')
            ->select([
                'pr.id',
                'pr.payroll_month',
                'pr.start_date',
                'pr.end_date',
                'pr.status',
                'pr.total_employees',
                'pr.total_gross_salary',
                'pr.total_deductions',
                'pr.total_net_pay',
                'pr.created_at',
                'pr.created_by',
                'pr.approved_at',
                'pr.approved_by',
            ])
            ->orderBy('pr.payroll_period', 'DESC');

        $total = $query->countAllResults();
        $results = $query->limit($limit, $offset)->get()->getResultArray();

        return [
            'data' => $results,
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
        ];
    }

    /**
     * Get payroll run details with employee payroll
     *
     * @param int $runId
     * @param int $limit
     * @param int $offset
     * @return array|null
     */
    public function getPayrollRunDetails(int $runId, int $limit = 100, int $offset = 0): ?array
    {
        $run = $this->db->table('payroll_runs')
            ->where('id', $runId)
            ->get()
            ->getRowArray();

        if (!$run) {
            return null;
        }

        // Get employee payroll details
        $query = $this->db->table('payroll_details pd')
            ->select([
                'pd.id',
                'pd.user_id',
                'u.full_name',
                'u.username',
                'd.name as department',
                'pd.basic_salary',
                'pd.gross_salary',
                'pd.total_deductions',
                'pd.net_salary',
                'pd.payment_status',
                'pd.payment_date',
                'pd.payment_reference',
            ])
            ->join('users u', 'u.id = pd.user_id')
            ->leftJoin('departments d', 'd.id = u.department_id')
            ->where('pd.payroll_run_id', $runId)
            ->orderBy('u.full_name', 'ASC');

        $totalEmployees = $query->countAllResults();
        $employees = $query->limit($limit, $offset)->get()->getResultArray();

        // Get line items for each employee
        foreach ($employees as &$employee) {
            $employee['line_items'] = $this->getPayrollLineItems($employee['id']);
        }

        $run['employees'] = $employees;
        $run['employee_count'] = $totalEmployees;
        $run['limit'] = $limit;
        $run['offset'] = $offset;

        return $run;
    }

    /**
     * Get line items for a payroll detail
     *
     * @param int $payrollDetailId
     * @return array
     */
    public function getPayrollLineItems(int $payrollDetailId): array
    {
        return $this->db->table('payroll_line_items')
            ->select([
                'id',
                'component_type_id',
                'component_name',
                'component_code',
                'amount',
                'is_earning',
                'is_deduction',
            ])
            ->where('payroll_detail_id', $payrollDetailId)
            ->orderBy('id', 'ASC')
            ->get()
            ->getResultArray();
    }

    /**
     * Create a new payroll run
     *
     * @param string $payrollMonth YYYY-MM format
     * @param string $startDate
     * @param string $endDate
     * @param int $createdBy
     * @return int Run ID
     * @throws Exception
     */
    public function createPayrollRun(string $payrollMonth, string $startDate, string $endDate, int $createdBy): int
    {
        try {
            $this->db->table('payroll_runs')
                ->insert([
                    'payroll_period' => "{$payrollMonth}-01",
                    'payroll_month' => $payrollMonth,
                    'start_date' => $startDate,
                    'end_date' => $endDate,
                    'status' => 'Draft',
                    'created_by' => $createdBy,
                ]);

            return $this->db->insertID();

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Process payroll run (generate payroll for all active employees)
     *
     * @param int $runId
     * @return array Summary of processing
     * @throws Exception
     */
    public function processPayrollRun(int $runId): array
    {
        try {
            $run = $this->db->table('payroll_runs')
                ->where('id', $runId)
                ->get()
                ->getRowArray();

            if (!$run) {
                throw new Exception('Payroll run not found');
            }

            if ($run['status'] !== 'Draft') {
                throw new Exception('Only draft payroll runs can be processed');
            }

            // Get all active employees with salary assignments
            $employees = $this->db->table('users u')
                ->select('u.id, u.full_name, u.username, esa.salary_structure_id, esa.basic_salary')
                ->join('employee_salary_assignments esa', 'esa.user_id = u.id')
                ->where('u.is_active', 1)
                ->where('esa.end_date IS NULL OR esa.end_date >= CURDATE()')
                ->get()
                ->getResultArray();

            $processedCount = 0;
            $totalGross = 0;
            $totalDeductions = 0;

            foreach ($employees as $employee) {
                $structure = $this->getSalaryStructure($employee['salary_structure_id']);
                $breakdown = $this->calculateSalaryBreakdown($employee['basic_salary'], $structure['components']);

                // Create payroll detail record
                $this->db->table('payroll_details')
                    ->insert([
                        'payroll_run_id' => $runId,
                        'user_id' => $employee['id'],
                        'basic_salary' => $employee['basic_salary'],
                        'gross_salary' => $breakdown['gross_salary'],
                        'total_deductions' => $breakdown['total_deductions'],
                        'net_salary' => $breakdown['net_salary'],
                        'payment_status' => 'Pending',
                    ]);

                $payrollDetailId = $this->db->insertID();

                // Create line items
                foreach (array_merge($breakdown['earnings'], $breakdown['deductions'], $breakdown['statutory']) as $item) {
                    $this->db->table('payroll_line_items')
                        ->insert([
                            'payroll_detail_id' => $payrollDetailId,
                            'component_type_id' => $item['component_id'],
                            'component_name' => $item['component_name'],
                            'component_code' => $item['component_code'],
                            'amount' => $item['amount'],
                            'is_earning' => in_array($item['component_code'], array_keys(array_flip(array_column($breakdown['earnings'], 'component_code')))) ? 1 : 0,
                            'is_deduction' => in_array($item['component_code'], array_keys(array_flip(array_column($breakdown['deductions'], 'component_code')))) ? 1 : 0,
                        ]);
                }

                $processedCount++;
                $totalGross += $breakdown['gross_salary'];
                $totalDeductions += $breakdown['total_deductions'];
            }

            // Update payroll run totals
            $this->db->table('payroll_runs')
                ->where('id', $runId)
                ->update([
                    'status' => 'Processing',
                    'total_employees' => $processedCount,
                    'total_gross_salary' => $totalGross,
                    'total_deductions' => $totalDeductions,
                    'total_net_pay' => $totalGross - $totalDeductions,
                ]);

            return [
                'processed' => $processedCount,
                'gross_salary' => $totalGross,
                'total_deductions' => $totalDeductions,
                'net_pay' => $totalGross - $totalDeductions,
            ];

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Approve payroll run
     *
     * @param int $runId
     * @param int $approvedBy
     * @return bool
     * @throws Exception
     */
    public function approvePayrollRun(int $runId, int $approvedBy): bool
    {
        try {
            $this->db->table('payroll_runs')
                ->where('id', $runId)
                ->update([
                    'status' => 'Approved',
                    'approved_by' => $approvedBy,
                    'approved_at' => date('Y-m-d H:i:s'),
                ]);

            return true;

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Mark payroll as paid
     *
     * @param int $runId
     * @return bool
     * @throws Exception
     */
    public function markPayrollPaid(int $runId): bool
    {
        try {
            $this->db->table('payroll_runs')
                ->where('id', $runId)
                ->update([
                    'status' => 'Paid',
                    'paid_at' => date('Y-m-d H:i:s'),
                ]);

            // Update all payroll details to Paid
            $this->db->table('payroll_details')
                ->where('payroll_run_id', $runId)
                ->update(['payment_status' => 'Paid']);

            return true;

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Get salary component types
     *
     * @return array
     */
    public function getSalaryComponentTypes(): array
    {
        return $this->db->table('salary_component_types')
            ->where('is_active', 1)
            ->orderBy('component_type', 'ASC')
            ->orderBy('sort_order', 'ASC')
            ->get()
            ->getResultArray();
    }
}
