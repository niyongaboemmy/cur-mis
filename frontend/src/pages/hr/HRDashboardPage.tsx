import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users, TrendingUp, Clock, AlertCircle, CheckCircle, DollarSign } from 'lucide-react';

interface DashboardMetrics {
  total_employees: number;
  active_contracts: number;
  pending_leave: number;
  contracts_expiring_30days: number;
  contracts_renewal_due: number;
  payroll_pending: number;
  leave_approved_this_month: number;
  contracts_renewed_this_year: number;
}

interface DepartmentData {
  department: string;
  count: number;
}

interface LeaveData {
  leave_type: string;
  count: number;
}

interface PayrollData {
  month: string;
  employees_paid: number;
  total_amount: number;
}

export default function HRDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [departmentData, setDepartmentData] = useState<DepartmentData[]>([]);
  const [leaveData, setLeaveData] = useState<LeaveData[]>([]);
  const [payrollData, setPayrollData] = useState<PayrollData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const [metricsRes, deptRes, leaveRes, payrollRes] = await Promise.all([
        fetch('/api/hr/contracts/summary'),
        fetch('/api/hr/employees/by-department'),
        fetch('/api/hr/leave/by-type'),
        fetch('/api/hr/payroll/trends'),
      ]);

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setMetrics(metricsData.data);
      }

      if (deptRes.ok) {
        const deptData = await deptRes.json();
        setDepartmentData(deptData.data);
      }

      if (leaveRes.ok) {
        const leaveResData = await leaveRes.json();
        setLeaveData(leaveResData.data);
      }

      if (payrollRes.ok) {
        const payrollResData = await payrollRes.json();
        setPayrollData(payrollResData.data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const StatCard = ({ icon: Icon, title, value, color, subtitle }: any) => (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );

  const COLORS = ['#3498db', '#e74c3c', '#f39c12', '#27ae60', '#9b59b6', '#1abc9c', '#34495e', '#e67e22'];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">HR Dashboard</h1>
          <p className="text-gray-600 mt-2">Employee metrics, payroll, and leave management overview</p>
        </div>

        {/* Metric Cards */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full"></div>
            </div>
          </div>
        ) : metrics ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <StatCard
                icon={Users}
                title="Total Employees"
                value={metrics.total_employees}
                color="bg-blue-500"
                subtitle="Active staff members"
              />
              <StatCard
                icon={CheckCircle}
                title="Active Contracts"
                value={metrics.active_contracts}
                color="bg-green-500"
                subtitle="Currently employed"
              />
              <StatCard
                icon={Clock}
                title="Pending Leave"
                value={metrics.pending_leave}
                color="bg-orange-500"
                subtitle="Awaiting approval"
              />
              <StatCard
                icon={AlertCircle}
                title="Renewal Due"
                value={metrics.contracts_renewal_due}
                color="bg-red-500"
                subtitle="Contract renewals needed"
              />
              <StatCard
                icon={TrendingUp}
                title="Expiring Soon"
                value={metrics.contracts_expiring_30days}
                color="bg-yellow-500"
                subtitle="Within 30 days"
              />
              <StatCard
                icon={DollarSign}
                title="Payroll Pending"
                value={metrics.payroll_pending}
                color="bg-purple-500"
                subtitle="Awaiting payment"
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Department Distribution */}
              {departmentData.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Employees by Department</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={departmentData}
                        dataKey="count"
                        nameKey="department"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label
                      >
                        {departmentData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Leave Usage */}
              {leaveData.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Leave Usage by Type</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={leaveData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="leave_type" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3498db" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Payroll Trends */}
            {payrollData.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Payroll Trends (Last 6 Months)</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={payrollData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="employees_paid" stroke="#3498db" name="Employees Paid" />
                    <Line yAxisId="right" type="monotone" dataKey="total_amount" stroke="#27ae60" name="Total Amount (RWF)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                <h3 className="text-sm font-bold text-blue-900 mb-2">Leave Approved This Month</h3>
                <p className="text-2xl font-bold text-blue-600">{metrics.leave_approved_this_month}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-6 border border-green-200">
                <h3 className="text-sm font-bold text-green-900 mb-2">Contracts Renewed This Year</h3>
                <p className="text-2xl font-bold text-green-600">{metrics.contracts_renewed_this_year}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
                <h3 className="text-sm font-bold text-purple-900 mb-2">Immediate Actions Needed</h3>
                <p className="text-2xl font-bold text-purple-600">{metrics.contracts_renewal_due + metrics.pending_leave}</p>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
