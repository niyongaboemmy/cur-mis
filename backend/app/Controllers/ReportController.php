<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\ReportService;
use App\Helpers\ResponseHelper;

/**
 * Report Controller
 *
 * Handles PDF generation and report exports
 */
class ReportController extends BaseController
{
    private ReportService $reportService;

    public function __construct()
    {
        parent::__construct();
        $this->reportService = new ReportService();
    }

    /**
     * GET /api/hr/reports/employee-master-list
     * Generate employee master list PDF
     *
     * @return void
     */
    public function generateEmployeeMasterListPDF(): void
    {
        try {
            $filepath = $this->reportService->generateEmployeeMasterListPDF();

            $this->downloadFile($filepath, 'Employee_Master_List_' . date('Ymd') . '.pdf');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/reports/payroll/:payrollRunId
     * Generate payroll summary PDF
     *
     * @param int $payrollRunId
     * @return void
     */
    public function generatePayrollSummaryPDF(int $payrollRunId): void
    {
        try {
            $filepath = $this->reportService->generatePayrollSummaryPDF($payrollRunId);

            $this->downloadFile($filepath, 'Payroll_Summary_' . date('Ymd') . '.pdf');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/reports/leave/:leaveRequestId
     * Generate leave request PDF
     *
     * @param int $leaveRequestId
     * @return void
     */
    public function generateLeaveRequestPDF(int $leaveRequestId): void
    {
        try {
            $filepath = $this->reportService->generateLeaveRequestPDF($leaveRequestId);

            $this->downloadFile($filepath, 'Leave_Request_' . date('Ymd') . '.pdf');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * POST /api/hr/reports/salary-certificate
     * Generate salary certificate PDF
     *
     * @return void
     */
    public function generateSalaryCertificatePDF(): void
    {
        try {
            $data = json_decode(file_get_contents('php://input'), true);

            if (empty($data['user_id']) || empty($data['period_start']) || empty($data['period_end'])) {
                ResponseHelper::error('User ID and period dates are required', 400);
                return;
            }

            $filepath = $this->reportService->generateSalaryCertificatePDF(
                $data['user_id'],
                $data['period_start'],
                $data['period_end']
            );

            $this->downloadFile($filepath, 'Salary_Certificate_' . date('Ymd') . '.pdf');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/reports/service-certificate/:userId
     * Generate service certificate PDF
     *
     * @param int $userId
     * @return void
     */
    public function generateServiceCertificatePDF(int $userId): void
    {
        try {
            $filepath = $this->reportService->generateServiceCertificatePDF($userId);

            $this->downloadFile($filepath, 'Service_Certificate_' . date('Ymd') . '.pdf');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/reports/contract/:contractId
     * Generate contract summary PDF
     *
     * @param int $contractId
     * @return void
     */
    public function generateContractSummaryPDF(int $contractId): void
    {
        try {
            $filepath = $this->reportService->generateContractSummaryPDF($contractId);

            $this->downloadFile($filepath, 'Contract_Summary_' . date('Ymd') . '.pdf');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/reports/dashboard
     * Generate HR dashboard report PDF
     *
     * @return void
     */
    public function generateHRDashboardReportPDF(): void
    {
        try {
            $filepath = $this->reportService->generateHRDashboardReportPDF();

            $this->downloadFile($filepath, 'HR_Dashboard_Report_' . date('Ymd') . '.pdf');

        } catch (\Exception $e) {
            ResponseHelper::error($e->getMessage(), 500);
        }
    }

    /**
     * Download file and output to response
     *
     * @param string $filepath
     * @param string $filename
     * @return void
     */
    private function downloadFile(string $filepath, string $filename): void
    {
        if (!file_exists($filepath)) {
            ResponseHelper::error('File not found', 404);
            return;
        }

        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . filesize($filepath));
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');
        header('Expires: 0');

        readfile($filepath);

        // Clean up temp file
        @unlink($filepath);

        exit;
    }
}
