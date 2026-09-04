import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Download, CheckCircle, AlertCircle, DollarSign } from 'lucide-react';
import Toast from '../../components/common/Toast';

interface SalaryStructure {
  id: number;
  name: string;
  description: string;
  applicable_level: string;
  basic_salary_min: number;
  basic_salary_max: number;
  components: SalaryComponent[];
}

interface SalaryComponent {
  id: number;
  component_name: string;
  component_code: string;
  component_type: string;
  percentage: number | null;
  fixed_amount: number | null;
  is_percentage: boolean;
}

interface PayrollRun {
  id: number;
  payroll_month: string;
  start_date: string;
  end_date: string;
  status: string;
  total_employees: number;
  total_gross_salary: number;
  total_deductions: number;
  total_net_pay: number;
  created_at: string;
}

interface ComponentType {
  id: number;
  name: string;
  code: string;
  component_type: string;
}

export default function PayrollManagementPage() {
  const [activeTab, setActiveTab] = useState<'structures' | 'payroll'>('structures');
  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [editingStructure, setEditingStructure] = useState<SalaryStructure | null>(null);
  const [showStructureForm, setShowStructureForm] = useState(false);
  const [showPayrollForm, setShowPayrollForm] = useState(false);
  const [newPayroll, setNewPayroll] = useState({ payroll_month: '', start_date: '', end_date: '' });

  useEffect(() => {
    if (activeTab === 'structures') {
      fetchStructures();
    } else {
      fetchPayrollRuns();
    }
  }, [activeTab]);

  const fetchStructures = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/hr/payroll/structures');
      const data = await response.json();
      setStructures(data.data);
    } catch (error) {
      setToast({ message: 'Failed to load salary structures', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPayrollRuns = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/hr/payroll/runs');
      const data = await response.json();
      setPayrollRuns(data.data);
    } catch (error) {
      setToast({ message: 'Failed to load payroll runs', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchComponentTypes = async () => {
    try {
      const response = await fetch('/api/hr/payroll/component-types');
      const data = await response.json();
      setComponentTypes(data.data);
    } catch (error) {
      // Silent fail for component types
    }
  };

  const handleSaveStructure = async (formData: any) => {
    try {
      const response = await fetch('/api/hr/payroll/structures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error('Failed to save structure');

      setToast({ message: 'Salary structure saved successfully', type: 'success' });
      setShowStructureForm(false);
      setEditingStructure(null);
      fetchStructures();
    } catch (error) {
      setToast({ message: 'Failed to save salary structure', type: 'error' });
    }
  };

  const handleCreatePayroll = async () => {
    if (!newPayroll.payroll_month || !newPayroll.start_date || !newPayroll.end_date) {
      setToast({ message: 'All fields are required', type: 'error' });
      return;
    }

    try {
      const response = await fetch('/api/hr/payroll/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPayroll)
      });

      if (!response.ok) throw new Error('Failed to create payroll run');

      setToast({ message: 'Payroll run created', type: 'success' });
      setShowPayrollForm(false);
      setNewPayroll({ payroll_month: '', start_date: '', end_date: '' });
      fetchPayrollRuns();
    } catch (error) {
      setToast({ message: 'Failed to create payroll run', type: 'error' });
    }
  };

  const handleProcessPayroll = async (runId: number) => {
    try {
      const response = await fetch(`/api/hr/payroll/runs/${runId}/process`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed to process payroll');

      setToast({ message: 'Payroll processed successfully', type: 'success' });
      fetchPayrollRuns();
    } catch (error) {
      setToast({ message: 'Failed to process payroll', type: 'error' });
    }
  };

  const handleApprovePayroll = async (runId: number) => {
    try {
      const response = await fetch(`/api/hr/payroll/runs/${runId}/approve`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed to approve payroll');

      setToast({ message: 'Payroll approved', type: 'success' });
      fetchPayrollRuns();
    } catch (error) {
      setToast({ message: 'Failed to approve payroll', type: 'error' });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'RWF' }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      'Draft': 'bg-gray-100 text-gray-800',
      'Processing': 'bg-blue-100 text-blue-800',
      'Approved': 'bg-green-100 text-green-800',
      'Paid': 'bg-purple-100 text-purple-800',
      'Cancelled': 'bg-red-100 text-red-800',
    };
    return `px-3 py-1 rounded-full text-sm font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`;
  };

  if (activeTab === 'structures') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Salary Structures</h1>
              <p className="text-gray-600 mt-2">Manage salary components and structures</p>
            </div>
            <button
              onClick={() => {
                setEditingStructure(null);
                setShowStructureForm(true);
              }}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              New Structure
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin">
                <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full"></div>
              </div>
            </div>
          ) : (
            <div className="grid gap-6">
              {structures.map((structure) => (
                <div key={structure.id} className="bg-white rounded-lg shadow-lg p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{structure.name}</h2>
                      {structure.description && (
                        <p className="text-gray-600 text-sm mt-1">{structure.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setEditingStructure(structure);
                        setShowStructureForm(true);
                      }}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                  </div>

                  {structure.basic_salary_min || structure.basic_salary_max ? (
                    <div className="mb-4 p-3 bg-gray-50 rounded">
                      <p className="text-sm text-gray-600">
                        Basic Salary Range: {structure.basic_salary_min ? formatCurrency(structure.basic_salary_min) : 'N/A'} - {structure.basic_salary_max ? formatCurrency(structure.basic_salary_max) : 'N/A'}
                      </p>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <h3 className="font-medium text-gray-900">Components:</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {structure.components.map((comp) => (
                        <div key={comp.id} className="bg-gray-50 p-3 rounded border border-gray-200">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium text-gray-900">{comp.component_name}</p>
                              <p className="text-xs text-gray-600">{comp.component_type}</p>
                            </div>
                            <div className="text-right">
                              {comp.is_percentage ? (
                                <p className="font-bold text-gray-900">{comp.percentage}%</p>
                              ) : (
                                <p className="font-bold text-gray-900">{formatCurrency(comp.fixed_amount)}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Payroll Runs Tab
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Payroll Runs</h1>
            <p className="text-gray-600 mt-2">Create and manage monthly payroll</p>
          </div>
          <button
            onClick={() => setShowPayrollForm(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New Payroll Run
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full"></div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {payrollRuns.map((run) => (
              <div key={run.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-4">
                    <DollarSign className="w-10 h-10 text-blue-600" />
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {new Date(run.start_date).toLocaleDateString()} - {new Date(run.end_date).toLocaleDateString()}
                      </h3>
                      <p className="text-sm text-gray-600">{run.total_employees} employees</p>
                    </div>
                  </div>
                  <span className={`${getStatusBadge(run.status)}`}>{run.status}</span>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded">
                  <div>
                    <p className="text-xs text-gray-600">Gross Salary</p>
                    <p className="font-bold text-gray-900">{formatCurrency(run.total_gross_salary)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Deductions</p>
                    <p className="font-bold text-gray-900">{formatCurrency(run.total_deductions)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Net Pay</p>
                    <p className="font-bold text-green-600">{formatCurrency(run.total_net_pay)}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {run.status === 'Draft' && (
                    <>
                      <button
                        onClick={() => handleProcessPayroll(run.id)}
                        className="px-4 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition text-sm font-medium"
                      >
                        <AlertCircle className="inline mr-1 w-4 h-4" />
                        Process
                      </button>
                    </>
                  )}
                  {run.status === 'Processing' && (
                    <button
                      onClick={() => handleApprovePayroll(run.id)}
                      className="px-4 py-2 bg-green-100 text-green-800 rounded hover:bg-green-200 transition text-sm font-medium"
                    >
                      <CheckCircle className="inline mr-1 w-4 h-4" />
                      Approve
                    </button>
                  )}
                  <button
                    className="px-4 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200 transition text-sm font-medium"
                  >
                    <Download className="inline mr-1 w-4 h-4" />
                    Export
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showPayrollForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h2 className="text-xl font-bold mb-4">Create Payroll Run</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Month (YYYY-MM)</label>
                  <input
                    type="month"
                    value={newPayroll.payroll_month}
                    onChange={(e) => setNewPayroll({ ...newPayroll, payroll_month: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newPayroll.start_date}
                    onChange={(e) => setNewPayroll({ ...newPayroll, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={newPayroll.end_date}
                    onChange={(e) => setNewPayroll({ ...newPayroll, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleCreatePayroll}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowPayrollForm(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
