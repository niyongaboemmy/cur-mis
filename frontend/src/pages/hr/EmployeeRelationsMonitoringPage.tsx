import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Download, Upload, CheckCircle, Clock } from 'lucide-react';
import { useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Spinner from '@/components/ui/Spinner';
import { hrMonitoringService } from '@/services/hrMonitoringService';

export default function EmployeeRelationsMonitoringPage() {
  const [activeTab, setActiveTab] = useState<'grievances' | 'conflicts' | 'counseling'>('grievances');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    employee_id: '',
    grievance_date: new Date().toISOString().split('T')[0],
    grievance_type: '',
    grievance_description: '',
    assigned_to: '',
  });
  const queryClient = useQueryClient();

  const { data: grievances, isLoading: grievancesLoading } = useQuery({
    queryKey: ['grievances'],
    queryFn: () => hrMonitoringService.getGrievances(1, 50),
    enabled: activeTab === 'grievances',
  });

  const { data: conflicts, isLoading: conflictsLoading } = useQuery({
    queryKey: ['conflicts'],
    queryFn: () => hrMonitoringService.getConflictResolutions(),
    enabled: activeTab === 'conflicts',
  });

  const { data: counseling, isLoading: counselingLoading } = useQuery({
    queryKey: ['counseling'],
    queryFn: () => hrMonitoringService.getCounselingRecords(0),
    enabled: activeTab === 'counseling',
  });

  const createGrievanceMutation = useMutation({
    mutationFn: (data: any) => hrMonitoringService.createGrievance(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grievances'] });
      setShowForm(false);
      setFormData({
        employee_id: '',
        grievance_date: new Date().toISOString().split('T')[0],
        grievance_type: '',
        grievance_description: '',
        assigned_to: '',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'grievances') {
      createGrievanceMutation.mutate(formData);
    }
  };

  const grievanceTypes = [
    'Salary Dispute',
    'Leave Denial',
    'Promotion',
    'Work Conditions',
    'Harassment',
    'Discrimination',
    'Other',
  ];

  if (grievancesLoading || conflictsLoading || counselingLoading) return <Spinner />;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-ink-950 p-6">
      <PageHeader
        title="Employee Relations Monitoring"
        description="Manage grievances, conflicts, and counseling records"
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-ink-700">
        {(['grievances', 'conflicts', 'counseling'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-medium border-b-2 transition ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
            }`}
          >
            {tab === 'grievances' && 'Grievances'}
            {tab === 'conflicts' && 'Conflicts'}
            {tab === 'counseling' && 'Counseling'}
          </button>
        ))}
      </div>

      {/* Grievances Section */}
      {activeTab === 'grievances' && (
        <>
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              File Grievance
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

          {/* Grievance Form */}
          {showForm && (
            <div className="bg-white dark:bg-ink-800 rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">File New Grievance</h3>
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
                  value={formData.grievance_date}
                  onChange={(e) => setFormData({ ...formData, grievance_date: e.target.value })}
                  className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                  required
                />
                <select
                  value={formData.grievance_type}
                  onChange={(e) => setFormData({ ...formData, grievance_type: e.target.value })}
                  className="col-span-2 px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                  required
                >
                  <option value="">Select Grievance Type</option>
                  {grievanceTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <textarea
                  placeholder="Grievance Description"
                  value={formData.grievance_description}
                  onChange={(e) => setFormData({ ...formData, grievance_description: e.target.value })}
                  className="col-span-2 px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                  rows={4}
                  required
                />
                <input
                  type="number"
                  placeholder="Assigned To (HR Staff ID)"
                  value={formData.assigned_to}
                  onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                  className="col-span-2 px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                />
                <div className="col-span-2 flex gap-2">
                  <button
                    type="submit"
                    disabled={createGrievanceMutation.isPending}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                  >
                    {createGrievanceMutation.isPending ? 'Filing...' : 'File Grievance'}
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

          {/* Grievances Table */}
          <div className="bg-white dark:bg-ink-800 rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100 dark:bg-ink-700">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Employee</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Type</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Filed Date</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Description</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-ink-700">
                {grievances?.data?.map((grievance: any) => (
                  <tr key={grievance.id} className="hover:bg-gray-50 dark:hover:bg-ink-700/50">
                    <td className="px-6 py-4 text-sm font-medium">Employee #{grievance.employee_id}</td>
                    <td className="px-6 py-4 text-sm">{grievance.grievance_type}</td>
                    <td className="px-6 py-4 text-sm">{grievance.grievance_date}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 truncate max-w-xs">
                      {grievance.grievance_description}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit ${
                          grievance.status === 'resolved'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                        }`}
                      >
                        {grievance.status === 'resolved' ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {grievance.status}
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
        </>
      )}

      {/* Conflicts Section */}
      {activeTab === 'conflicts' && (
        <div className="bg-white dark:bg-ink-800 rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100 dark:bg-ink-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Parties Involved</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Description</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Method</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-ink-700">
              {conflicts?.data?.map((conflict: any) => (
                <tr key={conflict.id} className="hover:bg-gray-50 dark:hover:bg-ink-700/50">
                  <td className="px-6 py-4 text-sm">{conflict.conflict_date}</td>
                  <td className="px-6 py-4 text-sm font-medium">{conflict.parties_involved}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 truncate max-w-xs">
                    {conflict.conflict_description}
                  </td>
                  <td className="px-6 py-4 text-sm">{conflict.resolution_method}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        conflict.status === 'resolved'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                      }`}
                    >
                      {conflict.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Counseling Section */}
      {activeTab === 'counseling' && (
        <div className="bg-white dark:bg-ink-800 rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100 dark:bg-ink-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Employee</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Counselor</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Topic</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Follow-up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-ink-700">
              {counseling?.data?.map((session: any) => (
                <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-ink-700/50">
                  <td className="px-6 py-4 text-sm">Employee #{session.employee_id}</td>
                  <td className="px-6 py-4 text-sm">Counselor #{session.counselor_id}</td>
                  <td className="px-6 py-4 text-sm">{session.counseling_date}</td>
                  <td className="px-6 py-4 text-sm font-medium">{session.session_topic}</td>
                  <td className="px-6 py-4 text-sm">
                    {session.follow_up_required ? `${session.follow_up_date}` : 'None'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
