<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class HRAnalyticsService
{
    /**
     * Get employees by department
     */
    public function getEmployeesByDepartment(): array
    {
        return DB::table('users')
            ->select('department', DB::raw('COUNT(*) as count'))
            ->where('is_active', true)
            ->whereNotNull('department')
            ->groupBy('department')
            ->orderByDesc('count')
            ->get()
            ->toArray();
    }

    /**
     * Get leave usage by type
     */
    public function getLeaveUsageByType(): array
    {
        return DB::table('leave_requests as lr')
            ->join('leave_types as lt', 'lr.leave_type_id', '=', 'lt.id')
            ->select('lt.name as leave_type', DB::raw('COUNT(*) as count'))
            ->where('lr.status', 'approved')
            ->whereYear('lr.start_date', date('Y'))
            ->groupBy('lt.id', 'lt.name')
            ->orderByDesc('count')
            ->get()
            ->toArray();
    }

    /**
     * Get payroll trends (last 6 months)
     */
    public function getPayrollTrends(): array
    {
        $trends = [];
        $sixMonthsAgo = now()->subMonths(5)->startOfMonth();

        for ($i = 0; $i < 6; $i++) {
            $month = $sixMonthsAgo->copy()->addMonths($i);
            $monthKey = $month->format('M Y');

            $data = DB::table('payroll_details')
                ->join('payroll_runs as pr', 'payroll_details.payroll_run_id', '=', 'pr.id')
                ->select(
                    DB::raw('COUNT(DISTINCT payroll_details.user_id) as employees_paid'),
                    DB::raw('SUM(payroll_details.net_salary) as total_amount')
                )
                ->whereYear('pr.month', $month->year)
                ->whereMonth('pr.month', $month->month)
                ->first();

            $trends[] = [
                'month' => $monthKey,
                'employees_paid' => $data->employees_paid ?? 0,
                'total_amount' => (int)($data->total_amount ?? 0)
            ];
        }

        return $trends;
    }

    /**
     * Get leave approvals by stage
     */
    public function getLeaveApprovalMetrics(): array
    {
        return [
            'pending_supervisor' => DB::table('leave_requests')
                ->where('approval_stage', 1)
                ->where('status', 'pending')
                ->count(),
            'pending_hr' => DB::table('leave_requests')
                ->where('approval_stage', 2)
                ->where('status', 'pending')
                ->count(),
            'pending_final' => DB::table('leave_requests')
                ->where('approval_stage', 3)
                ->where('status', 'pending')
                ->count(),
            'approved_this_month' => DB::table('leave_requests')
                ->where('status', 'approved')
                ->whereMonth('approved_at', now()->month)
                ->whereYear('approved_at', now()->year)
                ->count(),
            'rejected_this_month' => DB::table('leave_requests')
                ->where('status', 'rejected')
                ->whereMonth('rejected_at', now()->month)
                ->whereYear('rejected_at', now()->year)
                ->count()
        ];
    }

    /**
     * Get contract lifecycle metrics
     */
    public function getContractMetrics(): array
    {
        return [
            'active' => DB::table('employee_contracts')
                ->where('status', 'active')
                ->count(),
            'renewal_due' => DB::table('employee_contracts')
                ->where('status', 'active')
                ->where('renewal_due_date', '<=', now())
                ->count(),
            'expiring_30_days' => DB::table('employee_contracts')
                ->where('status', 'active')
                ->whereBetween('end_date', [now(), now()->addDays(30)])
                ->count(),
            'expired' => DB::table('employee_contracts')
                ->where('status', 'expired')
                ->count(),
            'renewed_this_year' => DB::table('employee_contracts')
                ->whereYear('renewed_at', now()->year)
                ->count()
        ];
    }

    /**
     * Get payroll metrics
     */
    public function getPayrollMetrics(): array
    {
        return [
            'pending_processing' => DB::table('payroll_runs')
                ->where('status', 'processing')
                ->count(),
            'pending_approval' => DB::table('payroll_runs')
                ->where('status', 'approved')
                ->count(),
            'total_this_month' => DB::table('payroll_runs')
                ->whereMonth('month', now()->month)
                ->whereYear('month', now()->year)
                ->sum('total_amount'),
            'employees_paid_this_month' => DB::table('payroll_details')
                ->join('payroll_runs', 'payroll_details.payroll_run_id', '=', 'payroll_runs.id')
                ->whereMonth('payroll_runs.month', now()->month)
                ->whereYear('payroll_runs.month', now()->year)
                ->distinct('payroll_details.user_id')
                ->count('payroll_details.user_id')
        ];
    }

    /**
     * Get salary distribution by salary band
     */
    public function getSalaryDistribution(): array
    {
        $bands = [
            ['min' => 0, 'max' => 500000, 'label' => 'Below 500K'],
            ['min' => 500000, 'max' => 1000000, 'label' => '500K - 1M'],
            ['min' => 1000000, 'max' => 2000000, 'label' => '1M - 2M'],
            ['min' => 2000000, 'max' => PHP_INT_MAX, 'label' => 'Above 2M'],
        ];

        $distribution = [];
        foreach ($bands as $band) {
            $count = DB::table('employee_salary_assignments as esa')
                ->join('users as u', 'esa.user_id', '=', 'u.id')
                ->where('u.is_active', true)
                ->whereBetween('esa.basic_salary', [$band['min'], $band['max']])
                ->count();

            $distribution[] = [
                'band' => $band['label'],
                'count' => $count
            ];
        }

        return $distribution;
    }

    /**
     * Get employee headcount trend
     */
    public function getHeadcountTrend(): array
    {
        $trend = [];
        $sixMonthsAgo = now()->subMonths(5)->startOfMonth();

        for ($i = 0; $i < 6; $i++) {
            $month = $sixMonthsAgo->copy()->addMonths($i);
            $monthKey = $month->format('M Y');

            $count = DB::table('users')
                ->where('is_active', true)
                ->where('employment_date', '<=', $month->endOfMonth())
                ->count();

            $trend[] = [
                'month' => $monthKey,
                'count' => $count
            ];
        }

        return $trend;
    }

    /**
     * Get department-wise contract expiry summary
     */
    public function getContractExpiryByDepartment(): array
    {
        return DB::table('employee_contracts as ec')
            ->join('users as u', 'ec.user_id', '=', 'u.id')
            ->select(
                'u.department',
                DB::raw("COUNT(CASE WHEN ec.end_date <= NOW() THEN 1 END) as expired"),
                DB::raw("COUNT(CASE WHEN ec.end_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY) THEN 1 END) as expiring_soon"),
                DB::raw("COUNT(CASE WHEN ec.status = 'active' THEN 1 END) as active")
            )
            ->where('ec.status', '!=', 'terminated')
            ->groupBy('u.department')
            ->get()
            ->toArray();
    }

    /**
     * Get leave balance overview
     */
    public function getLeaveBalanceOverview(): array
    {
        return DB::table('leave_balances as lb')
            ->join('leave_types as lt', 'lb.leave_type_id', '=', 'lt.id')
            ->select(
                'lt.name as leave_type',
                DB::raw('SUM(lb.total_days) as total_allocated'),
                DB::raw('SUM(lb.used_days) as used'),
                DB::raw('SUM(lb.remaining_days) as remaining'),
                DB::raw('COUNT(DISTINCT lb.user_id) as employees')
            )
            ->where('lb.fiscal_year', date('Y'))
            ->groupBy('lb.leave_type_id', 'lt.name')
            ->get()
            ->toArray();
    }
}
