import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Download, Upload, X } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import Spinner from '@/components/ui/Spinner';
import { hrMonitoringService } from '@/services/hrMonitoringService';

export default function PerformanceMonitoringPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchEmployee, setSearchEmployee] = useState('');
  const [formData, setFormData] = useState({
    employee_id: '',
    appraisal_period: '',
    appraisal_date: new Date().toISOString().split('T')[0],
    rating: '',
    comments: '',
    appraiser_id: '',
  });
  const queryClient = useQueryClient();

  const { data: appraisals, isLoading: appraisalsLoading } = useQuery({
    queryKey: ['appraisals'],
    queryFn: () => hrMonitoringService.getAppraisals(1, 50),
  });

  const { data: employees, isLoading: employeesLoading } = useQuery({
    queryKey: ['monitoring-employees', searchEmployee],
    queryFn: () => hrMonitoringService.getEmployees(1, 50, searchEmployee),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => hrMonitoringService.createAppraisal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appraisals'] });
      setShowForm(false);
      resetForm();
      toast.success('Appraisal created successfully');
    },
    onError: () => {
      toast.error('Failed to create appraisal');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) =>
      hrMonitoringService.updateAppraisal(editingId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appraisals'] });
      setShowForm(false);
      resetForm();
      setEditingId(null);
      toast.success('Appraisal updated successfully');
    },
    onError: () => {
      toast.error('Failed to update appraisal');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => hrMonitoringService.deleteAppraisal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appraisals'] });
      toast.success('Appraisal deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete appraisal');
    },
  });

  const resetForm = () => {
    setFormData({
      employee_id: '',
      appraisal_period: '',
      appraisal_date: new Date().toISOString().split('T')[0],
      rating: '',
      comments: '',
      appraiser_id: '',
    });
  };

  const handleEdit = (appraisal: any) => {
    setFormData({
      employee_id: appraisal.employee_id,
      appraisal_period: appraisal.appraisal_period,
      appraisal_date: appraisal.appraisal_date,
      rating: appraisal.rating,
      comments: appraisal.comments || '',
      appraiser_id: appraisal.appraiser_id || '',
    });
    setEditingId(appraisal.id);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  if (appraisalsLoading) return <Spinner />;

  const appraisalList = appraisals?.data?.appraisals || appraisals?.appraisals || [];
  const employeeList = employees?.data?.employees || employees?.employees || [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-ink-950 p-6">
      <PageHeader
        title="Performance Monitoring"
        description="Manage performance appraisals and ratings"
      />

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => {
            resetForm();
            setEditingId(null);
            setShowForm(!showForm);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Add Appraisal
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
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              {editingId ? 'Edit Appraisal' : 'Add Performance Appraisal'}
            </h3>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                resetForm();
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
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
                value={formData.employee_id}
                onChange={(e) =>
                  setFormData({ ...formData, employee_id: e.target.value })
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
              <label className="block text-sm font-medium mb-1">
                Appraisal Period
              </label>
              <input
                type="text"
                placeholder="e.g., 2026-Q3"
                value={formData.appraisal_period}
                onChange={(e) =>
                  setFormData({ ...formData, appraisal_period: e.target.value })
                }
                className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Appraisal Date
              </label>
              <input
                type="date"
                value={formData.appraisal_date}
                onChange={(e) =>
                  setFormData({ ...formData, appraisal_date: e.target.value })
                }
                className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Rating (1-5)
              </label>
              <input
                type="number"
                placeholder="1-5"
                min="1"
                max="5"
                step="0.1"
                value={formData.rating}
                onChange={(e) =>
                  setFormData({ ...formData, rating: e.target.value })
                }
                className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Appraiser ID
              </label>
              <input
                type="number"
                value={formData.appraiser_id}
                onChange={(e) =>
                  setFormData({ ...formData, appraiser_id: e.target.value })
                }
                className="px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white w-full"
              />
            </div>
            <textarea
              placeholder="Comments"
              value={formData.comments}
              onChange={(e) =>
                setFormData({ ...formData, comments: e.target.value })
              }
              className="col-span-2 px-3 py-2 border border-gray-300 dark:border-ink-700 rounded-lg bg-white dark:bg-ink-900 text-ink-900 dark:text-white"
            />
            <div className="col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={
                  createMutation.isPending || updateMutation.isPending
                }
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Saving...'
                  : editingId
                  ? 'Update Appraisal'
                  : 'Save Appraisal'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  resetForm();
                }}
                className="px-4 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded-lg"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Appraisals List */}
      <div className="bg-white dark:bg-ink-800 rounded-lg shadow overflow-hidden">
        {appraisalList.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No appraisals found. Start by adding one.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-100 dark:bg-ink-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold">
                  Period
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold">
                  Rating
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-sm font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-ink-700">
              {appraisalList.map((appraisal: any) => (
                <tr
                  key={appraisal.id}
                  className="hover:bg-gray-50 dark:hover:bg-ink-700"
                >
                  <td className="px-6 py-4 text-sm">
                    {appraisal.fname} {appraisal.lname}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {appraisal.appraisal_period}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {appraisal.appraisal_date}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">
                    {appraisal.rating}/5
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100">
                      {appraisal.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => handleEdit(appraisal)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(appraisal.id)}
                        disabled={deleteMutation.isPending}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 disabled:opacity-50"
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
    </div>
  );
}
