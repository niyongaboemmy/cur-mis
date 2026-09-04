<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\HRAnalyticsService;
use App\Helpers\ResponseHelper;

class HRAnalyticsController extends BaseController
{
    private HRAnalyticsService $analyticsService;

    public function __construct()
    {
        parent::__construct();
        $this->analyticsService = new HRAnalyticsService();
    }

    /**
     * GET /api/hr/employees/by-department
     * Get employee count by department
     */
    public function getEmployeesByDepartment(): void
    {
        try {
            $data = $this->analyticsService->getEmployeesByDepartment();
            ResponseHelper::success($data);
        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/leave/by-type
     * Get leave usage by type
     */
    public function getLeaveUsageByType(): void
    {
        try {
            $data = $this->analyticsService->getLeaveUsageByType();
            ResponseHelper::success($data);
        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/payroll/trends
     * Get payroll trends for last 6 months
     */
    public function getPayrollTrends(): void
    {
        try {
            $data = $this->analyticsService->getPayrollTrends();
            ResponseHelper::success($data);
        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/leave/approval-metrics
     * Get leave approval metrics
     */
    public function getLeaveApprovalMetrics(): void
    {
        try {
            $data = $this->analyticsService->getLeaveApprovalMetrics();
            ResponseHelper::success($data);
        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/analytics/contract-metrics
     * Get contract lifecycle metrics
     */
    public function getContractMetrics(): void
    {
        try {
            $data = $this->analyticsService->getContractMetrics();
            ResponseHelper::success($data);
        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/analytics/payroll-metrics
     * Get payroll metrics
     */
    public function getPayrollMetrics(): void
    {
        try {
            $data = $this->analyticsService->getPayrollMetrics();
            ResponseHelper::success($data);
        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/analytics/salary-distribution
     * Get salary distribution by band
     */
    public function getSalaryDistribution(): void
    {
        try {
            $data = $this->analyticsService->getSalaryDistribution();
            ResponseHelper::success($data);
        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/analytics/headcount-trend
     * Get headcount trend for last 6 months
     */
    public function getHeadcountTrend(): void
    {
        try {
            $data = $this->analyticsService->getHeadcountTrend();
            ResponseHelper::success($data);
        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/analytics/contract-expiry-by-dept
     * Get contract expiry summary by department
     */
    public function getContractExpiryByDepartment(): void
    {
        try {
            $data = $this->analyticsService->getContractExpiryByDepartment();
            ResponseHelper::success($data);
        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/analytics/leave-balance-overview
     * Get leave balance overview
     */
    public function getLeaveBalanceOverview(): void
    {
        try {
            $data = $this->analyticsService->getLeaveBalanceOverview();
            ResponseHelper::success($data);
        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }
}
