import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, CheckCircle, Clock, X } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import Spinner from '@/components/ui/Spinner';
import { hrMonitoringService } from '@/services/hrMonitoringService';

export default function EmployeeRelationsMonitoringPage() {
  const [activeTab, setActiveTab] = useState<'grievances' | 'conflicts' | 'counseling'>('grievances');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchEmployee, setSearchEmployee] = useState('');

  const [grievanceData, setGrievanceData] = useState({
    employee_id: '',
    grievance_date: new Date().toISOString().split('T')[0],
    grievance_type: '',
    grievance_description: '',
    assigned_to: '',
  });

  const [conflictData, setConflictData] = useState({
    conflict_date: new Date().toISOString().split('T')[0],
    parties_involved: '',
    conflict_description: '',
    resolution_method: '',
    mediator_id: '',
    status: 'pending',
  });

  const queryClient = useQueryClient();

  const { data: grievances, isLoading: grievancesLoading } = useQuery({
    queryKey: ['grievances'],
    queryFn: () => hrMonitoringService.getGrievances(1, 50),
  });

  const { data: conflicts, isLoading: conflictsLoading } = useQuery({
    queryKey: ['conflicts'],
    queryFn: () => hrMonitoringService.getConflictResolutions(),
  });

  const { data: employees } = useQuery({
    queryKey: ['monitoring-employees', searchEmployee],
    queryFn: () => hrMonitoringService.getEmployees(1, 50, searchEmployee),
  });

  const grievanceTypes = [
    'Salary Dispute',
    'Leave Denial',
    'Promotion',
    'Work Conditions',
    'Harassment',
    'Discrimination',
    'Other',
  ];

  const grievanceMutation = useMutation({
    mutationFn: (data: any) =>
      editingId
        ? hrMonitoringService.updateGrievanceStatus(editingId, data)
        : hrMonitoringService.createGrievance(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grievances'] });
      setShowForm(false);
      resetForms();
      setEditingId(null);
      toast.success(editingId ? 'Grievance updated' : 'Grievance filed');
    },
    onError: () => {
      toast.error('Failed to save grievance');
    },
  });

  const conflictMutation = useMutation({
    mutationFn: (data: any) =>
      editingId
        ? hrMonitoringService.updateConflictResolution(editingId, data)
        : hrMonitoringService.recordConflictResolution(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conflicts'] });
      setShowForm(false);
      resetForms();
      setEditingId(null);
      toast.success(editingId ? 'Conflict updated' : 'Conflict recorded');
    },
    onError: () => {
      toast.error('Failed to save conflict');
    },
  });

  const deleteGrievanceMutation = useMutation({
    mutationFn: (id: number) => hrMonitoringService.deleteGrievance(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grievances'] });
      toast.success('Grievance deleted');
    },
    onError: () => {
      toast.error('Failed to delete grievance');
    },
  });

  const deleteConflictMutation = useMutation({
    mutationFn: (id: number) => hrMonitoringService.deleteConflictResolution(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conflicts'] });
      toast.success('Conflict deleted');
    },
    onError: () => {
      toast.error('Failed to delete conflict');
    },
  });

  const resetForms = () => {
    setGrievanceData({
      employee_id: '',
      grievance_date: new Date().toISOString().split('T')[0],
      grievance_type: '',
      grievance_description: '',
      assigned_to: '',
    });
    setConflictData({
      conflict_date: new Date().toISOString().split('T')[0],
      parties_involved: '',
      conflict_description: '',
      resolution_method: '',
      mediator_id: '',
      status: 'pending',
    });
  };

  const handleEditGrievance = (grievance: any) => {
    setGrievanceData({
      employee_id: grievance.employee_id,
      grievance_date: grievance.grievance_date,
      grievance_type: grievance.grievance_type,
      grievance_description: grievance.grievance_description,
      assigned_to: grievance.assigned_to || '',
    });
    setEditingId(grievance.id);
    setShowForm(true);
  };

  const handleEditConflict = (conflict: any) => {
    setConflictData({
      conflict_date: conflict.conflict_date,
      parties_involved: conflict.parties_involved,
      conflict_description: conflict.conflict_description,
      resolution_method: conflict.resolution_method,
      mediator_id: conflict.mediator_id || '',
      status: conflict.status,
    });
    setEditingId(conflict.id);
    setShowForm(true);
  };

  const handleSubmitGrievance = (e: React.FormEvent) => {
    e.preventDefault();
    grievanceMutation.mutate(grievanceData);
  };

  const handleSubmitConflict = (e: React.FormEvent) => {
    e.preventDefault();
    conflictMutation.mutate(conflictData);
  };

  if (grievancesLoading || conflictsLoading) return <Spinner />;

  const grievanceList = (grievances as any)?.data?.grievances || [];
  const conflictList = (conflicts as any)?.data || (conflicts as any) || [];
  const employeeList = (employees as any)?.data?.employees || (employees as any)?.employees || [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-ink-950 p-6">
      <PageHeader
        title="Employee Relations Monitoring"
        description="Manage grievances, conflicts, and support records"
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-ink-700">
        {(['grievances', 'conflicts'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setShowForm(false);
              setEditingId(null);
              resetForms();
            }}
            className={`px-6 py-3 font-medium border-b-2 transition ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
            }`}
          >
            {tab === 'grievances' && 'Grievances'}
            {tab === 'conflicts' && 'Conflicts'}
          </button>
        ))}
      </div>

      {/* Grievances Section */}
      {activeTab === 'grievances' && (
        <>
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => {
                resetForms();
                setEditingId(null);
                setShowForm(!showForm);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              File Grievance
            </button>
          </div>

          {/* Grievance Form */}
          {showForm && activeTab === 'grievances' && (
            <div className="bg-white dark:bg-ink-800 rounded-lg shadow p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  {editingId ? 'Edit Grievance' : 'File New Grievance'}
                </h3>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    resetForms();
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmitGrievance} className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Employee</label>
                  <input
                    type="text"
                    placeholder="Search employee..."
                    value={searchEmployee}
                    onChange={(e) => setSearchEmployee(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white mb-2"
                  />
                  <select
                    value={grievanceData.employee_id}
                    onChange={(e) =>
                      setGrievanceData({ ...grievanceData, employee_id: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                    required
                  >
                    <option value="">Select Employee</option>
                    {employeeList.map((emp: any) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fname} {emp.lname}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Grievance Date</label>
                  <input
                    type="date"
                    value={grievanceData.grievance_date}
                    onChange={(e) =>
                      setGrievanceData({ ...grievanceData, grievance_date: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                    required
                  />
                </div>
                <select
                  value={grievanceData.grievance_type}
                  onChange={(e) =>
                    setGrievanceData({ ...grievanceData, grievance_type: e.target.value })
                  }
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
                  value={grievanceData.grievance_description}
                  onChange={(e) =>
                    setGrievanceData({ ...grievanceData, grievance_description: e.target.value })
                  }
                  className="col-span-2 px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                  rows={4}
                  required
                />
                <input
                  type="number"
                  placeholder="Assigned To (HR Staff ID)"
                  value={grievanceData.assigned_to}
                  onChange={(e) =>
                    setGrievanceData({ ...grievanceData, assigned_to: e.target.value })
                  }
                  className="col-span-2 px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                />
                <div className="col-span-2 flex gap-2">
                  <button
                    type="submit"
                    disabled={grievanceMutation.isPending}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                  >
                    {grievanceMutation.isPending
                      ? 'Saving...'
                      : editingId
                      ? 'Update Grievance'
                      : 'File Grievance'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                      resetForms();
                    }}
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
            {grievanceList.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No grievances found.</div>
            ) : (
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
                  {grievanceList.map((grievance: any) => (
                    <tr key={grievance.id} className="hover:bg-gray-50 dark:hover:bg-ink-700/50">
                      <td className="px-6 py-4 text-sm font-medium">
                        {grievance.fname} {grievance.lname}
                      </td>
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
                          <button
                            onClick={() => handleEditGrievance(grievance)}
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteGrievanceMutation.mutate(grievance.id)}
                            disabled={deleteGrievanceMutation.isPending}
                            className="text-red-600 hover:text-red-700 dark:text-red-400 disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Conflicts Section */}
      {activeTab === 'conflicts' && (
        <>
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => {
                resetForms();
                setEditingId(null);
                setShowForm(!showForm);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Record Conflict
            </button>
          </div>

          {/* Conflict Form */}
          {showForm && activeTab === 'conflicts' && (
            <div className="bg-white dark:bg-ink-800 rounded-lg shadow p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  {editingId ? 'Edit Conflict' : 'Record Conflict Resolution'}
                </h3>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    resetForms();
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmitConflict} className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Conflict Date</label>
                  <input
                    type="date"
                    value={conflictData.conflict_date}
                    onChange={(e) =>
                      setConflictData({ ...conflictData, conflict_date: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Parties Involved</label>
                  <input
                    type="text"
                    placeholder="Names or IDs"
                    value={conflictData.parties_involved}
                    onChange={(e) =>
                      setConflictData({ ...conflictData, parties_involved: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                    required
                  />
                </div>
                <textarea
                  placeholder="Conflict Description"
                  value={conflictData.conflict_description}
                  onChange={(e) =>
                    setConflictData({ ...conflictData, conflict_description: e.target.value })
                  }
                  className="col-span-2 px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                  rows={3}
                  required
                />
                <div>
                  <label className="block text-sm font-medium mb-1">Resolution Method</label>
                  <select
                    value={conflictData.resolution_method}
                    onChange={(e) =>
                      setConflictData({ ...conflictData, resolution_method: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                    required
                  >
                    <option value="">Select Method</option>
                    <option value="mediation">Mediation</option>
                    <option value="negotiation">Negotiation</option>
                    <option value="arbitration">Arbitration</option>
                    <option value="escalation">Escalation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={conflictData.status}
                    onChange={(e) =>
                      setConflictData({ ...conflictData, status: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <input
                  type="number"
                  placeholder="Mediator ID"
                  value={conflictData.mediator_id}
                  onChange={(e) =>
                    setConflictData({ ...conflictData, mediator_id: e.target.value })
                  }
                  className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
                />
                <div className="col-span-2 flex gap-2">
                  <button
                    type="submit"
                    disabled={conflictMutation.isPending}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                  >
                    {conflictMutation.isPending
                      ? 'Saving...'
                      : editingId
                      ? 'Update Conflict'
                      : 'Record Conflict'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                      resetForms();
                    }}
                    className="px-4 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Conflicts Table */}
          <div className="bg-white dark:bg-ink-800 rounded-lg shadow overflow-hidden">
            {conflictList.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No conflicts found.</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-100 dark:bg-ink-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Parties Involved</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Method</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-ink-700">
                  {conflictList.map((conflict: any) => (
                    <tr key={conflict.id} className="hover:bg-gray-50 dark:hover:bg-ink-700/50">
                      <td className="px-6 py-4 text-sm">{conflict.conflict_date}</td>
                      <td className="px-6 py-4 text-sm">{conflict.parties_involved}</td>
                      <td className="px-6 py-4 text-sm">{conflict.resolution_method}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            conflict.status === 'resolved'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : conflict.status === 'in_progress'
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                              : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                          }`}
                        >
                          {conflict.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleEditConflict(conflict)}
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteConflictMutation.mutate(conflict.id)}
                            disabled={deleteConflictMutation.isPending}
                            className="text-red-600 hover:text-red-700 dark:text-red-400 disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
