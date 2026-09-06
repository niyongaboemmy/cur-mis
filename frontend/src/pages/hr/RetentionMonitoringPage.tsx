import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Download, Upload, TrendingDown } from 'lucide-react';
import { useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Spinner from '@/components/ui/Spinner';
import { hrMonitoringService } from '@/services/hrMonitoringService';

export default function RetentionMonitoringPage() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    employee_id: '',
    exit_date: '',
    reason_for_leaving: '',
    interviewer_id: '',
    job_satisfaction: '',
    management_satisfaction: '',
    work_environment_satisfaction: '',
    comments: '',
    would_rehire: 'true',
  });
  const queryClient = useQueryClient();

  const { data: exitInterviews, isLoading: exitLoading } = useQuery({
    queryKey: ['exit-interviews'],
    queryFn: () => hrMonitoringService.getExitInterviews(),
  });

  const { data: turnoverAnalytics, isLoading: turnoverLoading } = useQuery({
    queryKey: ['turnover-analytics'],
    queryFn: () => hrMonitoringService.getTurnoverAnalytics(),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => hrMonitoringService.recordExitInterview(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exit-interviews'] });
      setShowForm(false);
      setFormData({
        employee_id: '',
        exit_date: '',
        reason_for_leaving: '',
        interviewer_id: '',
        job_satisfaction: '',
        management_satisfaction: '',
        work_environment_satisfaction: '',
        comments: '',
        would_rehire: 'true',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const exitReasons = [
    'Better opportunity elsewhere',
    'Relocation',
    'Personal reasons',
    'Health issues',
    'Further studies',
    'Retirement',
    'Family commitments',
    'Other',
  ];

  if (exitLoading || turnoverLoading) return <Spinner />;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-ink-950 p-6">
      <PageHeader
        title="Retention & Turnover Monitoring"
        description="Track exit interviews, turnover rates, and retention strategies"
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-ink-800 rounded-lg p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-600 dark:text-gray-400">Exit Interviews</p>
          <p className="text-2xl font-bold text-ink-900 dark:text-white">{exitInterviews?.data?.length || 0}</p>
        </div>
        <div className="bg-white dark:bg-ink-800 rounded-lg p-4 border-l-4 border-red-500">
          <p className="text-sm text-gray-600 dark:text-gray-400">Avg Turnover Rate</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {turnoverAnalytics?.data?.[0]?.turnover_rate?.toFixed(2) || 0}%
          </p>
        </div>
        <div className="bg-white dark:bg-ink-800 rounded-lg p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-600 dark:text-gray-400">Avg Tenure</p>
          <p className="text-2xl font-bold text-ink-900 dark:text-white">
            {turnoverAnalytics?.data?.[0]?.avg_tenure_months?.toFixed(1) || 0} mo.
          </p>
        </div>
        <div className="bg-white dark:bg-ink-800 rounded-lg p-4 border-l-4 border-purple-500">
          <p className="text-sm text-gray-600 dark:text-gray-400">Rehire Rate</p>
          <p className="text-2xl font-bold text-ink-900 dark:text-white">
            {exitInterviews?.data?.filter((e: any) => e.would_rehire).length || 0}/
            {exitInterviews?.data?.length || 0}
          </p>
        </div>
      </div>

      {/* Exit Interviews Section */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4">Exit Interviews</h3>

        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            <Plus className="w-4 h-4" />
            Record Exit Interview
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition">
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white dark:bg-ink-800 rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Record Exit Interview</h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <input
                type="number"
                placeholder="Employee ID"
                value={formData.employee_id}
                onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                required
              />
              <input
                type="date"
                value={formData.exit_date}
                onChange={(e) => setFormData({ ...formData, exit_date: e.target.value })}
                className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                required
              />
              <select
                value={formData.reason_for_leaving}
                onChange={(e) => setFormData({ ...formData, reason_for_leaving: e.target.value })}
                className="col-span-2 px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                required
              >
                <option value="">Select Reason for Leaving</option>
                {exitReasons.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Interviewer ID"
                value={formData.interviewer_id}
                onChange={(e) => setFormData({ ...formData, interviewer_id: e.target.value })}
                className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
              />
              <select
                value={formData.would_rehire}
                onChange={(e) => setFormData({ ...formData, would_rehire: e.target.value })}
                className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
              >
                <option value="true">Would Rehire: Yes</option>
                <option value="false">Would Rehire: No</option>
              </select>

              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2">Job Satisfaction (1-5)</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={formData.job_satisfaction}
                  onChange={(e) => setFormData({ ...formData, job_satisfaction: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2">Management Satisfaction (1-5)</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={formData.management_satisfaction}
                  onChange={(e) => setFormData({ ...formData, management_satisfaction: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2">Work Environment Satisfaction (1-5)</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={formData.work_environment_satisfaction}
                  onChange={(e) => setFormData({ ...formData, work_environment_satisfaction: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                />
              </div>

              <textarea
                placeholder="Comments / Feedback"
                value={formData.comments}
                onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                className="col-span-2 px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                rows={4}
              />

              <div className="col-span-2 flex gap-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Recording...' : 'Record Interview'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Exit Interviews Table */}
        <div className="bg-white dark:bg-ink-800 rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100 dark:bg-ink-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Employee</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Exit Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Reason</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Job Satisfaction</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Management</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Would Rehire</th>
                <th className="px-6 py-3 text-center text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-ink-700">
              {exitInterviews?.data?.map((interview: any) => (
                <tr key={interview.id} className="hover:bg-gray-50 dark:hover:bg-ink-700/50">
                  <td className="px-6 py-4 text-sm font-medium">Employee #{interview.employee_id}</td>
                  <td className="px-6 py-4 text-sm">{interview.exit_date}</td>
                  <td className="px-6 py-4 text-sm">{interview.reason_for_leaving}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium">
                      {interview.job_satisfaction}/5
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs font-medium">
                      {interview.management_satisfaction}/5
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        interview.would_rehire
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}
                    >
                      {interview.would_rehire ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center gap-2">
                      <button className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="text-red-600 hover:text-red-700 dark:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Turnover Analytics */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Turnover Analytics</h3>
        <div className="bg-white dark:bg-ink-800 rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100 dark:bg-ink-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Report Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Starting Employees</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Hired</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Left</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Turnover Rate</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Avg Tenure</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Top Exit Reasons</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-ink-700">
              {turnoverAnalytics?.data?.map((report: any) => (
                <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-ink-700/50">
                  <td className="px-6 py-4 text-sm">{report.report_date}</td>
                  <td className="px-6 py-4 text-sm">{report.total_employees_start}</td>
                  <td className="px-6 py-4 text-sm text-green-600 dark:text-green-400 font-medium">
                    +{report.employees_hired}
                  </td>
                  <td className="px-6 py-4 text-sm text-red-600 dark:text-red-400 font-medium">
                    -{report.employees_left}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold">
                    <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                      {report.turnover_rate.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">{report.avg_tenure_months.toFixed(1)} months</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                    {report.top_exit_reasons}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
