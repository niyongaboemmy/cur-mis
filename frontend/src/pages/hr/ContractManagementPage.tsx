import React, { useState, useEffect } from 'react';
import { Plus, Edit2, CheckCircle, AlertCircle, Clock, XCircle, Calendar } from 'lucide-react';
import Toast from '../../components/common/Toast';

interface Contract {
  id: number;
  user_id: number;
  full_name: string;
  username: string;
  department: string;
  contract_type: string;
  contract_number: string;
  start_date: string;
  end_date: string;
  position_title: string;
  employment_level: string;
  status: string;
  renewal_due_date: string;
  renewal_status: string;
}

interface ContractType {
  id: number;
  name: string;
  code: string;
  default_duration_days: number;
  renewal_notice_days: number;
}

interface ContractSummary {
  active_contracts: number;
  renewal_due: number;
  expiring_soon: number;
  expired: number;
}

export default function ContractManagementPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'renewal' | 'expiring' | 'expired'>('all');
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [renewData, setRenewData] = useState({ new_end_date: '' });

  useEffect(() => {
    fetchContracts();
    fetchSummary();
  }, []);

  const fetchContracts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/hr/contracts');
      const data = await response.json();
      setContracts(data.data);
    } catch (error) {
      setToast({ message: 'Failed to load contracts', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await fetch('/hr/contracts/summary');
      const data = await response.json();
      setSummary(data.data);
    } catch (error) {
      // Silent fail
    }
  };


  const handleRenewContract = async () => {
    if (!selectedContract || !renewData.new_end_date) {
      setToast({ message: 'Please enter new end date', type: 'error' });
      return;
    }

    try {
      const response = await fetch(`/api/hr/contracts/${selectedContract.id}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(renewData)
      });

      if (!response.ok) throw new Error('Failed to renew contract');

      setToast({ message: 'Contract renewed successfully', type: 'success' });
      setShowRenewModal(false);
      setSelectedContract(null);
      setRenewData({ new_end_date: '' });
      fetchContracts();
      fetchSummary();
    } catch (error) {
      setToast({ message: 'Failed to renew contract', type: 'error' });
    }
  };

  const getStatusBadge = (renewalStatus: string) => {
    const styles: Record<string, any> = {
      'ACTIVE': { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
      'RENEWAL DUE': { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100' },
      'EXPIRING SOON (30 days)': { icon: Clock, color: 'text-orange-600', bg: 'bg-orange-100' },
      'EXPIRED': { icon: XCircle, color: 'text-gray-600', bg: 'bg-gray-100' },
    };
    const style = styles[renewalStatus] || styles['ACTIVE'];
    const Icon = style.icon;
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${style.bg}`}>
        <Icon className={`w-4 h-4 ${style.color}`} />
        <span className={`text-sm font-medium ${style.color}`}>{renewalStatus}</span>
      </div>
    );
  };

  const getFilteredContracts = () => {
    return contracts.filter((c) => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'active') return c.renewal_status.includes('ACTIVE') && !c.renewal_status.includes('EXPIRING');
      if (activeFilter === 'renewal') return c.renewal_status.includes('RENEWAL DUE');
      if (activeFilter === 'expiring') return c.renewal_status.includes('EXPIRING SOON');
      if (activeFilter === 'expired') return c.renewal_status === 'EXPIRED';
      return true;
    });
  };

  const filteredContracts = getFilteredContracts();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Contract Management</h1>
            <p className="text-gray-600 mt-2">Manage employee contracts and track renewals</p>
          </div>
          <button
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New Contract
          </button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Active Contracts</p>
                  <p className="text-3xl font-bold text-gray-900">{summary.active_contracts}</p>
                </div>
                <CheckCircle className="w-12 h-12 text-green-600 opacity-20" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Renewal Due</p>
                  <p className="text-3xl font-bold text-red-900">{summary.renewal_due}</p>
                </div>
                <AlertCircle className="w-12 h-12 text-red-600 opacity-20" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Expiring Soon</p>
                  <p className="text-3xl font-bold text-orange-900">{summary.expiring_soon}</p>
                </div>
                <Clock className="w-12 h-12 text-orange-600 opacity-20" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Expired</p>
                  <p className="text-3xl font-bold text-gray-900">{summary.expired}</p>
                </div>
                <XCircle className="w-12 h-12 text-gray-400 opacity-20" />
              </div>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {['all', 'active', 'renewal', 'expiring', 'expired'].map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter as any)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap font-medium transition ${
                activeFilter === filter
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>

        {/* Contracts List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full"></div>
            </div>
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Contracts Found</h3>
            <p className="text-gray-600">No contracts match the selected filter</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredContracts.map((contract) => (
              <div key={contract.id} className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900">{contract.full_name}</h3>
                    <p className="text-sm text-gray-600">{contract.position_title}</p>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(contract.renewal_status)}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 mb-4 p-4 bg-gray-50 rounded">
                  <div>
                    <p className="text-xs text-gray-600">Contract Type</p>
                    <p className="font-medium text-gray-900">{contract.contract_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Start Date</p>
                    <p className="font-medium text-gray-900">
                      {new Date(contract.start_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">End Date</p>
                    <p className="font-medium text-gray-900">
                      {new Date(contract.end_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Department</p>
                    <p className="font-medium text-gray-900">{contract.department || 'N/A'}</p>
                  </div>
                </div>

                {contract.renewal_due_date && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-yellow-900">Renewal Due</p>
                      <p className="text-sm text-yellow-800">
                        {new Date(contract.renewal_due_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  {contract.status === 'Draft' && (
                    <>
                      <button
                        onClick={() => {
                          setSelectedContract(contract);
                          // Show edit modal
                        }}
                        className="px-4 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition text-sm font-medium"
                      >
                        <Edit2 className="inline mr-1 w-4 h-4" />
                        Edit
                      </button>
                      <button
                        className="px-4 py-2 bg-green-100 text-green-800 rounded hover:bg-green-200 transition text-sm font-medium"
                      >
                        <CheckCircle className="inline mr-1 w-4 h-4" />
                        Approve
                      </button>
                    </>
                  )}

                  {contract.status === 'Active' && (
                    <>
                      <button
                        onClick={() => {
                          setSelectedContract(contract);
                          setShowRenewModal(true);
                        }}
                        className="px-4 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition text-sm font-medium"
                      >
                        <Calendar className="inline mr-1 w-4 h-4" />
                        Renew
                      </button>
                      <button
                        className="px-4 py-2 bg-red-100 text-red-800 rounded hover:bg-red-200 transition text-sm font-medium"
                      >
                        <XCircle className="inline mr-1 w-4 h-4" />
                        Terminate
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Renew Modal */}
        {showRenewModal && selectedContract && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h2 className="text-xl font-bold mb-4">Renew Contract</h2>
              <div className="mb-4 p-3 bg-gray-50 rounded">
                <p className="text-sm text-gray-600">
                  <strong>{selectedContract.full_name}</strong> - {selectedContract.position_title}
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current End Date</label>
                  <input
                    type="date"
                    value={selectedContract.end_date}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New End Date</label>
                  <input
                    type="date"
                    value={renewData.new_end_date}
                    onChange={(e) => setRenewData({ new_end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleRenewContract}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Renew
                  </button>
                  <button
                    onClick={() => {
                      setShowRenewModal(false);
                      setSelectedContract(null);
                      setRenewData({ new_end_date: '' });
                    }}
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
