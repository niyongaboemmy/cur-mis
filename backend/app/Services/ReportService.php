<?php

declare(strict_types=1);

namespace App\Services;

use Dompdf\Dompdf;
use Exception;

/**
 * Report Service
 *
 * Handles generation of HR reports and PDF exports
 */
class ReportService
{
    private $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    /**
     * Generate employee master list PDF
     *
     * @return string Path to PDF file
     * @throws Exception
     */
    public function generateEmployeeMasterListPDF(): string
    {
        try {
            $employees = $this->db->table('v_employee_master_list')
                ->get()
                ->getResultArray();

            $html = $this->renderEmployeeListHTML($employees);
            $pdf = $this->renderPDF($html, 'Employee Master List');

            return $pdf;

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Generate payroll summary PDF
     *
     * @param int $payrollRunId
     * @return string Path to PDF file
     * @throws Exception
     */
    public function generatePayrollSummaryPDF(int $payrollRunId): string
    {
        try {
            $run = $this->db->table('payroll_runs')
                ->where('id', $payrollRunId)
                ->get()
                ->getRowArray();

            if (!$run) {
                throw new Exception('Payroll run not found');
            }

            $payrollDetails = $this->db->table('payroll_details pd')
                ->select([
                    'pd.id',
                    'u.full_name',
                    'u.username',
                    'd.name as department',
                    'pd.basic_salary',
                    'pd.gross_salary',
                    'pd.total_deductions',
                    'pd.net_salary',
                    'pd.payment_status',
                ])
                ->join('users u', 'u.id = pd.user_id')
                ->leftJoin('departments d', 'd.id = u.department_id')
                ->where('pd.payroll_run_id', $payrollRunId)
                ->get()
                ->getResultArray();

            $html = $this->renderPayrollPDFHTML($run, $payrollDetails);
            $pdf = $this->renderPDF($html, 'Payroll Summary');

            return $pdf;

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Generate leave request PDF
     *
     * @param int $leaveRequestId
     * @return string Path to PDF file
     * @throws Exception
     */
    public function generateLeaveRequestPDF(int $leaveRequestId): string
    {
        try {
            $leaveRequest = $this->db->table('leave_requests lr')
                ->select([
                    'lr.*',
                    'u.full_name',
                    'u.username',
                    'lt.name as leave_type',
                    'd.name as department',
                    'sup.full_name as supervisor_name',
                ])
                ->join('users u', 'u.id = lr.user_id')
                ->join('leave_types lt', 'lt.id = lr.leave_type_id')
                ->leftJoin('departments d', 'd.id = u.department_id')
                ->leftJoin('users sup', 'sup.id = u.supervisor_id')
                ->where('lr.id', $leaveRequestId)
                ->get()
                ->getRowArray();

            if (!$leaveRequest) {
                throw new Exception('Leave request not found');
            }

            $html = $this->renderLeaveRequestPDFHTML($leaveRequest);
            $pdf = $this->renderPDF($html, 'Leave Request');

            return $pdf;

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Generate salary certificate PDF
     *
     * @param int $userId
     * @param string $periodStart
     * @param string $periodEnd
     * @return string Path to PDF file
     * @throws Exception
     */
    public function generateSalaryCertificatePDF(int $userId, string $periodStart, string $periodEnd): string
    {
        try {
            $user = $this->db->table('users')
                ->where('id', $userId)
                ->get()
                ->getRowArray();

            if (!$user) {
                throw new Exception('User not found');
            }

            $totalGross = $this->db->table('payroll_details pd')
                ->selectSum('pd.gross_salary')
                ->join('payroll_runs pr', 'pr.id = pd.payroll_run_id')
                ->where('pd.user_id', $userId)
                ->where('pr.start_date >=', $periodStart)
                ->where('pr.end_date <=', $periodEnd)
                ->get()
                ->getRowArray()['gross_salary'] ?? 0;

            $averageSalary = $this->db->table('payroll_details pd')
                ->selectAvg('pd.gross_salary')
                ->join('payroll_runs pr', 'pr.id = pd.payroll_run_id')
                ->where('pd.user_id', $userId)
                ->where('pr.start_date >=', $periodStart)
                ->where('pr.end_date <=', $periodEnd)
                ->get()
                ->getRowArray()['gross_salary'] ?? 0;

            $html = $this->renderSalaryCertificateHTML($user, $periodStart, $periodEnd, $totalGross, $averageSalary);
            $pdf = $this->renderPDF($html, 'Salary Certificate');

            return $pdf;

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Generate service certificate PDF
     *
     * @param int $userId
     * @return string Path to PDF file
     * @throws Exception
     */
    public function generateServiceCertificatePDF(int $userId): string
    {
        try {
            $user = $this->db->table('users')
                ->where('id', $userId)
                ->select('id, full_name, username, employment_date, email, phone_number')
                ->get()
                ->getRowArray();

            if (!$user) {
                throw new Exception('User not found');
            }

            $yearsOfService = $this->calculateYearsOfService($user['employment_date']);

            $html = $this->renderServiceCertificateHTML($user, $yearsOfService);
            $pdf = $this->renderPDF($html, 'Service Certificate');

            return $pdf;

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Generate contract summary PDF
     *
     * @param int $contractId
     * @return string Path to PDF file
     * @throws Exception
     */
    public function generateContractSummaryPDF(int $contractId): string
    {
        try {
            $contract = $this->db->table('employee_contracts ec')
                ->select([
                    'ec.*',
                    'u.full_name',
                    'u.username',
                    'u.email',
                    'd.name as department',
                    'ct.name as contract_type',
                    'sup.full_name as supervisor_name',
                ])
                ->join('users u', 'u.id = ec.user_id')
                ->join('contract_types ct', 'ct.id = ec.contract_type_id')
                ->leftJoin('departments d', 'd.id = ec.department_id')
                ->leftJoin('users sup', 'sup.id = ec.reporting_to_id')
                ->where('ec.id', $contractId)
                ->get()
                ->getRowArray();

            if (!$contract) {
                throw new Exception('Contract not found');
            }

            $html = $this->renderContractSummaryHTML($contract);
            $pdf = $this->renderPDF($html, 'Contract Summary');

            return $pdf;

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Generate HR dashboard report PDF
     *
     * @return string Path to PDF file
     * @throws Exception
     */
    public function generateHRDashboardReportPDF(): string
    {
        try {
            // Collect all HR metrics
            $metrics = [
                'total_employees' => $this->db->table('users')
                    ->where('is_active', 1)
                    ->countAllResults(),
                'active_contracts' => $this->db->table('employee_contracts')
                    ->where('status', 'Active')
                    ->countAllResults(),
                'pending_leave' => $this->db->table('leave_requests')
                    ->where('status', 'Pending')
                    ->countAllResults(),
                'contracts_expiring_30days' => $this->db->table('employee_contracts ec')
                    ->where('ec.status', 'Active')
                    ->where('ec.end_date <=', date('Y-m-d', strtotime('+30 days')))
                    ->where('ec.end_date >=', date('Y-m-d'))
                    ->countAllResults(),
                'contracts_renewal_due' => $this->db->table('employee_contracts ec')
                    ->where('ec.status', 'Active')
                    ->where('ec.renewal_due_date <=', date('Y-m-d'))
                    ->countAllResults(),
            ];

            // Get department breakdown
            $departmentStats = $this->db->table('users u')
                ->select(['d.name as department', 'COUNT(*) as count'])
                ->join('departments d', 'd.id = u.department_id')
                ->where('u.is_active', 1)
                ->groupBy('d.id')
                ->get()
                ->getResultArray();

            // Get leave type usage
            $leaveUsage = $this->db->table('leave_requests lr')
                ->select(['lt.name as leave_type', 'COUNT(*) as count'])
                ->join('leave_types lt', 'lt.id = lr.leave_type_id')
                ->where('lr.status', 'Approved')
                ->where('YEAR(lr.start_date)', date('Y'))
                ->groupBy('lt.id')
                ->get()
                ->getResultArray();

            $html = $this->renderHRDashboardPDFHTML($metrics, $departmentStats, $leaveUsage);
            $pdf = $this->renderPDF($html, 'HR Dashboard Report');

            return $pdf;

        } catch (Exception $e) {
            throw $e;
        }
    }

    /**
     * Render PDF using Dompdf
     *
     * @param string $html
     * @param string $filename
     * @return string Path to PDF file
     */
    private function renderPDF(string $html, string $filename): string
    {
        $dompdf = new Dompdf();
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        $filename = preg_replace('/[^a-zA-Z0-9_-]/', '_', $filename) . '_' . date('Ymd_His') . '.pdf';
        $filepath = sys_get_temp_dir() . '/' . $filename;

        file_put_contents($filepath, $dompdf->output());

        return $filepath;
    }

    /**
     * Render employee list HTML
     *
     * @param array $employees
     * @return string
     */
    private function renderEmployeeListHTML(array $employees): string
    {
        $html = '
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { text-align: center; color: #333; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #2c3e50; color: white; padding: 10px; text-align: left; }
                td { padding: 8px; border-bottom: 1px solid #ddd; }
                tr:nth-child(even) { background-color: #f9f9f9; }
                .header { text-align: center; margin-bottom: 30px; }
                .date { color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Employee Master List</h1>
                <p class="date">Generated: ' . date('Y-m-d H:i:s') . '</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Staff ID</th>
                        <th>Name</th>
                        <th>Department</th>
                        <th>Degree</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>RSSB #</th>
                    </tr>
                </thead>
                <tbody>';

        foreach ($employees as $emp) {
            $html .= '
                    <tr>
                        <td>' . htmlspecialchars($emp['staff_id']) . '</td>
                        <td>' . htmlspecialchars($emp['name']) . '</td>
                        <td>' . htmlspecialchars($emp['department_or_faculty'] ?? 'N/A') . '</td>
                        <td>' . htmlspecialchars($emp['degree'] ?? '') . '</td>
                        <td>' . htmlspecialchars($emp['email'] ?? '') . '</td>
                        <td>' . htmlspecialchars($emp['phone_number'] ?? '') . '</td>
                        <td>' . htmlspecialchars($emp['rssb_number'] ?? '') . '</td>
                    </tr>';
        }

        $html .= '
                </tbody>
            </table>
        </body>
        </html>';

        return $html;
    }

    /**
     * Render payroll PDF HTML
     *
     * @param array $run
     * @param array $payrollDetails
     * @return string
     */
    private function renderPayrollPDFHTML(array $run, array $payrollDetails): string
    {
        $html = '
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #2c3e50; }
                .summary { background-color: #ecf0f1; padding: 15px; margin: 20px 0; border-radius: 5px; }
                .summary-item { display: inline-block; width: 25%; text-align: center; }
                .summary-item strong { display: block; color: #2c3e50; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #2c3e50; color: white; padding: 10px; text-align: left; }
                td { padding: 8px; border-bottom: 1px solid #ddd; }
                tr:nth-child(even) { background-color: #f9f9f9; }
                .total-row { background-color: #e8f4f8; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>Payroll Summary Report</h1>
            <p>Period: ' . htmlspecialchars($run['payroll_month']) . '</p>
            <div class="summary">
                <div class="summary-item">
                    <strong>Total Employees</strong>
                    ' . $run['total_employees'] . '
                </div>
                <div class="summary-item">
                    <strong>Gross Salary</strong>
                    RWF ' . number_format($run['total_gross_salary']) . '
                </div>
                <div class="summary-item">
                    <strong>Total Deductions</strong>
                    RWF ' . number_format($run['total_deductions']) . '
                </div>
                <div class="summary-item">
                    <strong>Net Pay</strong>
                    RWF ' . number_format($run['total_net_pay']) . '
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Staff ID</th>
                        <th>Name</th>
                        <th>Department</th>
                        <th>Basic</th>
                        <th>Gross</th>
                        <th>Deductions</th>
                        <th>Net Salary</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>';

        foreach ($payrollDetails as $detail) {
            $html .= '
                    <tr>
                        <td>' . htmlspecialchars($detail['username']) . '</td>
                        <td>' . htmlspecialchars($detail['full_name']) . '</td>
                        <td>' . htmlspecialchars($detail['department'] ?? 'N/A') . '</td>
                        <td>RWF ' . number_format($detail['basic_salary']) . '</td>
                        <td>RWF ' . number_format($detail['gross_salary']) . '</td>
                        <td>RWF ' . number_format($detail['total_deductions']) . '</td>
                        <td>RWF ' . number_format($detail['net_salary']) . '</td>
                        <td>' . htmlspecialchars($detail['payment_status']) . '</td>
                    </tr>';
        }

        $html .= '
                </tbody>
            </table>
        </body>
        </html>';

        return $html;
    }

    /**
     * Render leave request PDF HTML
     *
     * @param array $leaveRequest
     * @return string
     */
    private function renderLeaveRequestPDFHTML(array $leaveRequest): string
    {
        $daysRequested = (strtotime($leaveRequest['end_date']) - strtotime($leaveRequest['start_date'])) / (24 * 60 * 60) + 1;

        $html = '
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { text-align: center; color: #2c3e50; }
                .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2c3e50; padding-bottom: 20px; }
                .info-section { margin: 20px 0; }
                .info-row { display: flex; margin: 10px 0; }
                .label { width: 30%; font-weight: bold; color: #2c3e50; }
                .value { width: 70%; }
                .reason { background-color: #f9f9f9; padding: 15px; border-left: 4px solid #3498db; margin-top: 20px; }
                .status { text-align: center; font-size: 24px; color: #27ae60; font-weight: bold; margin-top: 30px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Leave Request Form</h1>
                <p>Request ID: ' . $leaveRequest['id'] . '</p>
            </div>
            <div class="info-section">
                <div class="info-row">
                    <div class="label">Employee Name:</div>
                    <div class="value">' . htmlspecialchars($leaveRequest['full_name']) . '</div>
                </div>
                <div class="info-row">
                    <div class="label">Staff ID:</div>
                    <div class="value">' . htmlspecialchars($leaveRequest['username']) . '</div>
                </div>
                <div class="info-row">
                    <div class="label">Department:</div>
                    <div class="value">' . htmlspecialchars($leaveRequest['department'] ?? 'N/A') . '</div>
                </div>
                <div class="info-row">
                    <div class="label">Leave Type:</div>
                    <div class="value">' . htmlspecialchars($leaveRequest['leave_type']) . '</div>
                </div>
                <div class="info-row">
                    <div class="label">Start Date:</div>
                    <div class="value">' . date('Y-m-d', strtotime($leaveRequest['start_date'])) . '</div>
                </div>
                <div class="info-row">
                    <div class="label">End Date:</div>
                    <div class="value">' . date('Y-m-d', strtotime($leaveRequest['end_date'])) . '</div>
                </div>
                <div class="info-row">
                    <div class="label">Days Requested:</div>
                    <div class="value">' . intval($daysRequested) . ' days</div>
                </div>
                <div class="info-row">
                    <div class="label">Contact During Absence:</div>
                    <div class="value">' . htmlspecialchars($leaveRequest['contact_during_absence'] ?? 'N/A') . '</div>
                </div>
            </div>
            <div class="reason">
                <strong>Reason:</strong><br>
                ' . nl2br(htmlspecialchars($leaveRequest['reason'] ?? 'Not provided')) . '
            </div>
            <div class="status">
                Status: ' . htmlspecialchars($leaveRequest['status']) . '
            </div>
        </body>
        </html>';

        return $html;
    }

    /**
     * Render salary certificate HTML
     *
     * @param array $user
     * @param string $periodStart
     * @param string $periodEnd
     * @param float $totalGross
     * @param float $averageSalary
     * @return string
     */
    private function renderSalaryCertificateHTML(array $user, string $periodStart, string $periodEnd, float $totalGross, float $averageSalary): string
    {
        $html = '
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: "Times New Roman", serif; margin: 40px; line-height: 1.8; }
                .letterhead { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #000; padding-bottom: 20px; }
                .letterhead h1 { margin: 0; font-size: 24px; color: #2c3e50; }
                .letterhead p { margin: 5px 0; color: #555; }
                .certificate-title { text-align: center; font-size: 20px; font-weight: bold; text-transform: uppercase; margin: 30px 0; }
                .content { margin: 30px 0; }
                .content p { margin: 15px 0; text-align: justify; }
                .details { margin: 30px 0; }
                .detail-row { margin: 10px 0; }
                .label { font-weight: bold; width: 40%; display: inline-block; }
                .signature-section { margin-top: 50px; display: flex; justify-content: space-between; }
                .signature { width: 40%; text-align: center; border-top: 1px solid #000; margin-top: 40px; }
            </style>
        </head>
        <body>
            <div class="letterhead">
                <h1>COLLEGE OF SCIENCE AND TECHNOLOGY</h1>
                <p>Human Resources Department</p>
            </div>
            <div class="certificate-title">
                Salary Certificate
            </div>
            <div class="content">
                <p>This is to certify that <strong>' . htmlspecialchars($user['full_name']) . '</strong> bearing Staff ID <strong>' . htmlspecialchars($user['username']) . '</strong> is an employee of this institution.</p>
            </div>
            <div class="details">
                <div class="detail-row">
                    <span class="label">Name:</span>
                    <span>' . htmlspecialchars($user['full_name']) . '</span>
                </div>
                <div class="detail-row">
                    <span class="label">Staff ID:</span>
                    <span>' . htmlspecialchars($user['username']) . '</span>
                </div>
                <div class="detail-row">
                    <span class="label">Period:</span>
                    <span>' . date('Y-m-d', strtotime($periodStart)) . ' to ' . date('Y-m-d', strtotime($periodEnd)) . '</span>
                </div>
                <div class="detail-row">
                    <span class="label">Total Gross Salary:</span>
                    <span>RWF ' . number_format($totalGross, 2) . '</span>
                </div>
                <div class="detail-row">
                    <span class="label">Average Monthly Salary:</span>
                    <span>RWF ' . number_format($averageSalary, 2) . '</span>
                </div>
            </div>
            <p style="margin-top: 30px;">This certificate is issued for ' . htmlspecialchars($user['full_name']) . ' for official use.</p>
            <div class="signature-section">
                <div class="signature">
                    <p>Authorized Officer</p>
                    <p style="font-size: 12px; color: #666;">Date: ' . date('Y-m-d') . '</p>
                </div>
            </div>
        </body>
        </html>';

        return $html;
    }

    /**
     * Render service certificate HTML
     *
     * @param array $user
     * @param string $yearsOfService
     * @return string
     */
    private function renderServiceCertificateHTML(array $user, string $yearsOfService): string
    {
        $html = '
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: "Times New Roman", serif; margin: 40px; line-height: 1.8; text-align: center; }
                .letterhead { margin-bottom: 40px; border-bottom: 3px solid #000; padding-bottom: 20px; }
                .letterhead h1 { margin: 0; font-size: 24px; color: #2c3e50; }
                .certificate-title { font-size: 20px; font-weight: bold; text-transform: uppercase; margin: 30px 0; }
                .content { margin: 30px 0; line-height: 2; }
                .content p { margin: 20px 0; }
                .highlight { font-size: 18px; font-weight: bold; color: #2c3e50; }
                .signature-section { margin-top: 50px; }
                .signature { border-top: 1px solid #000; margin-top: 40px; width: 50%; margin-left: 25%; }
            </style>
        </head>
        <body>
            <div class="letterhead">
                <h1>COLLEGE OF SCIENCE AND TECHNOLOGY</h1>
                <p>Human Resources Department</p>
            </div>
            <div class="certificate-title">
                Certificate of Service
            </div>
            <div class="content">
                <p>This is to certify that</p>
                <p class="highlight">' . htmlspecialchars($user['full_name']) . '</p>
                <p>Staff ID: ' . htmlspecialchars($user['username']) . '</p>
                <p>has been employed at the College of Science and Technology</p>
                <p>since <span class="highlight">' . date('d F Y', strtotime($user['employment_date'])) . '</span></p>
                <p>and has served for <span class="highlight">' . $yearsOfService . '</span> years of faithful service.</p>
                <p>During this period, the employee has conducted themselves in a professional manner.</p>
            </div>
            <div class="signature-section">
                <p>Dated this ' . date('jS F Y') . '</p>
                <div class="signature">
                    <p>Human Resources Manager</p>
                </div>
            </div>
        </body>
        </html>';

        return $html;
    }

    /**
     * Render contract summary HTML
     *
     * @param array $contract
     * @return string
     */
    private function renderContractSummaryHTML(array $contract): string
    {
        $html = '
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #2c3e50; }
                .info-section { margin: 20px 0; background-color: #f9f9f9; padding: 15px; border-left: 4px solid #3498db; }
                .info-row { display: flex; margin: 10px 0; }
                .label { width: 30%; font-weight: bold; color: #2c3e50; }
                .value { width: 70%; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #2c3e50; color: white; padding: 10px; text-align: left; }
                td { padding: 8px; border-bottom: 1px solid #ddd; }
            </style>
        </head>
        <body>
            <h1>Employment Contract Summary</h1>
            <div class="info-section">
                <div class="info-row">
                    <div class="label">Employee Name:</div>
                    <div class="value">' . htmlspecialchars($contract['full_name']) . '</div>
                </div>
                <div class="info-row">
                    <div class="label">Staff ID:</div>
                    <div class="value">' . htmlspecialchars($contract['username']) . '</div>
                </div>
                <div class="info-row">
                    <div class="label">Email:</div>
                    <div class="value">' . htmlspecialchars($contract['email'] ?? 'N/A') . '</div>
                </div>
                <div class="info-row">
                    <div class="label">Department:</div>
                    <div class="value">' . htmlspecialchars($contract['department'] ?? 'N/A') . '</div>
                </div>
            </div>
            <div class="info-section">
                <div class="info-row">
                    <div class="label">Contract Type:</div>
                    <div class="value">' . htmlspecialchars($contract['contract_type']) . '</div>
                </div>
                <div class="info-row">
                    <div class="label">Contract Number:</div>
                    <div class="value">' . htmlspecialchars($contract['contract_number'] ?? 'N/A') . '</div>
                </div>
                <div class="info-row">
                    <div class="label">Position:</div>
                    <div class="value">' . htmlspecialchars($contract['position_title']) . '</div>
                </div>
                <div class="info-row">
                    <div class="label">Employment Level:</div>
                    <div class="value">' . htmlspecialchars($contract['employment_level'] ?? 'N/A') . '</div>
                </div>
            </div>
            <div class="info-section">
                <div class="info-row">
                    <div class="label">Start Date:</div>
                    <div class="value">' . date('Y-m-d', strtotime($contract['start_date'])) . '</div>
                </div>
                <div class="info-row">
                    <div class="label">End Date:</div>
                    <div class="value">' . ($contract['end_date'] ? date('Y-m-d', strtotime($contract['end_date'])) : 'Indefinite') . '</div>
                </div>
                <div class="info-row">
                    <div class="label">Status:</div>
                    <div class="value">' . htmlspecialchars($contract['status']) . '</div>
                </div>
            </div>
            <p style="text-align: center; margin-top: 40px; color: #666; font-size: 12px;">
                Document generated: ' . date('Y-m-d H:i:s') . '
            </p>
        </body>
        </html>';

        return $html;
    }

    /**
     * Render HR dashboard PDF HTML
     *
     * @param array $metrics
     * @param array $departmentStats
     * @param array $leaveUsage
     * @return string
     */
    private function renderHRDashboardPDFHTML(array $metrics, array $departmentStats, array $leaveUsage): string
    {
        $html = '
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { text-align: center; color: #2c3e50; }
                h2 { color: #34495e; margin-top: 30px; }
                .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 30px 0; }
                .metric-box { background-color: #ecf0f1; padding: 15px; border-radius: 5px; }
                .metric-box strong { display: block; color: #2c3e50; font-size: 16px; }
                .metric-box span { font-size: 24px; color: #27ae60; font-weight: bold; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #2c3e50; color: white; padding: 10px; text-align: left; }
                td { padding: 8px; border-bottom: 1px solid #ddd; }
                tr:nth-child(even) { background-color: #f9f9f9; }
            </style>
        </head>
        <body>
            <h1>HR Dashboard Report</h1>
            <p style="text-align: center; color: #666;">Generated: ' . date('Y-m-d H:i:s') . '</p>

            <h2>Key Metrics</h2>
            <div class="metrics">
                <div class="metric-box">
                    <strong>Total Employees</strong>
                    <span>' . $metrics['total_employees'] . '</span>
                </div>
                <div class="metric-box">
                    <strong>Active Contracts</strong>
                    <span>' . $metrics['active_contracts'] . '</span>
                </div>
                <div class="metric-box">
                    <strong>Pending Leave Requests</strong>
                    <span>' . $metrics['pending_leave'] . '</span>
                </div>
                <div class="metric-box">
                    <strong>Contracts Expiring (30 days)</strong>
                    <span>' . $metrics['contracts_expiring_30days'] . '</span>
                </div>
                <div class="metric-box">
                    <strong>Renewal Due</strong>
                    <span>' . $metrics['contracts_renewal_due'] . '</span>
                </div>
            </div>

            <h2>Employees by Department</h2>
            <table>
                <thead>
                    <tr>
                        <th>Department</th>
                        <th>Employee Count</th>
                    </tr>
                </thead>
                <tbody>';

        foreach ($departmentStats as $dept) {
            $html .= '
                    <tr>
                        <td>' . htmlspecialchars($dept['department'] ?? 'N/A') . '</td>
                        <td>' . $dept['count'] . '</td>
                    </tr>';
        }

        $html .= '
                </tbody>
            </table>

            <h2>Leave Usage This Year</h2>
            <table>
                <thead>
                    <tr>
                        <th>Leave Type</th>
                        <th>Approved Requests</th>
                    </tr>
                </thead>
                <tbody>';

        foreach ($leaveUsage as $leave) {
            $html .= '
                    <tr>
                        <td>' . htmlspecialchars($leave['leave_type']) . '</td>
                        <td>' . $leave['count'] . '</td>
                    </tr>';
        }

        $html .= '
                </tbody>
            </table>
        </body>
        </html>';

        return $html;
    }

    /**
     * Calculate years of service
     *
     * @param string $employmentDate
     * @return string
     */
    private function calculateYearsOfService(string $employmentDate): string
    {
        $start = new \DateTime($employmentDate);
        $end = new \DateTime();
        $interval = $start->diff($end);

        $years = $interval->y;
        $months = $interval->m;

        if ($years === 0) {
            return "{$months} months";
        }

        return "{$years} year" . ($years > 1 ? 's' : '') . ($months > 0 ? " {$months} months" : '');
    }
}
