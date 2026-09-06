import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface LeaveRequest {
  id: number;
  employee_name: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  reason: string;
  status: string;
  current_stage_order: number;
  stage_label: string;
  created_at: string;
  approval_chain: ApprovalStep[];
}

interface ApprovalStep {
  stage_order: number;
  stage_label: string;
  status: string;
  approved_by: number | null;
  approved_at: string | null;
  remarks: string | null;
}

interface ProgressView {
  id: number;
  employee_name: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: string;
  steps: ProgressStep[];
  current_step: number;
  total_steps: number;
  signatures_done: number;
  signatures_total: number;
}

interface ProgressStep {
  key: string;
  label: string;
  state: 'completed' | 'current' | 'pending' | 'rejected' | 'changes_requested' | 'cancelled' | 'skipped';
  sla_hours: number | null;
  decided_at: string | null;
  actor: string | null;
  actor_role: string | null;
  comment: string | null;
}

export default function SupervisorLeaveApprovalDashboard() {
  const [activeView, setActiveView] = useState<'queue' | 'details'>('queue');
  const [queue, setQueue] = useState<LeaveRequest[]>([]);
  const [progress, setProgress] = useState<ProgressView | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [decision, setDecision] = useState<{ action: 'approve' | 'reject' | 'changes' | null; comment: string }>({
    action: null,
    comment: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (activeView === 'queue') {
      fetchQueue();
    }
  }, [activeView]);

  const fetchQueue = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/hr/leave/approvals/queue');
      const data = await response.json();

      if (!response.ok) {
        toast.error(data.message || 'Failed to load queue');
        return;
      }

      setQueue(data.data);
    } catch (error) {
      toast.error('Failed to load approval queue');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProgress = async (requestId: number) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/hr/leave/requests/${requestId}/progress`);
      const data = await response.json();

      if (!response.ok) {
        toast.error('Failed to load request details');
        return;
      }

      setProgress(data.data);
      setActiveView('details');
    } catch (error) {
      toast.error('Failed to load request details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecision = async () => {
    if (!progress || !decision.action) {
      toast.error('Please select an action');
      return;
    }

    if (decision.action !== 'approve' && !decision.comment.trim()) {
      toast.error('Please provide a reason');
      return;
    }

    setIsSubmitting(true);
    try {
      const decisionMap = {
        approve: 'approved',
        reject: 'rejected',
        changes: 'changes_requested'
      };

      const response = await fetch(`/api/hr/leave/approvals/${progress.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: decisionMap[decision.action],
          comment: decision.comment
        })
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.message || 'Failed to record decision');
        return;
      }

      toast.success(`Leave request ${decision.action}d successfully`);

      // Refresh queue and go back
      await fetchQueue();
      setActiveView('queue');
      setProgress(null);
      setDecision({ action: null, comment: '' });

    } catch (error) {
      toast.error('Failed to record decision');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStageColor = (status: string) => {
    const colors: Record<string, string> = {
      'Pending Approval': 'bg-yellow-50 border-yellow-200',
      'Approved': 'bg-green-50 border-green-200',
      'Rejected': 'bg-red-50 border-red-200',
      'Changes Requested': 'bg-orange-50 border-orange-200'
    };
    return colors[status] || 'bg-gray-50 border-gray-200';
  };

  if (activeView === 'queue') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">

        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Leave Approval Queue</h1>
          <p className="text-gray-600 mb-8">Review and approve leave requests from your team</p>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin">
                <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full"></div>
              </div>
            </div>
          ) : queue.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">All Caught Up!</h3>
              <p className="text-gray-600">No leave requests pending your approval</p>
            </div>
          ) : (
            <div className="space-y-4">
              {queue.map((request) => (
                <div
                  key={request.id}
                  onClick={() => {
                    fetchProgress(request.id);
                  }}
                  className={`border-l-4 rounded-lg p-4 bg-white shadow hover:shadow-lg transition cursor-pointer ${getStageColor(
                    request.stage_label
                  )}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-gray-900">{request.employee_name}</h3>
                      <p className="text-sm text-gray-600">{request.leave_type_name}</p>
                    </div>
                    <span className="text-xs font-medium px-3 py-1 bg-blue-100 text-blue-800 rounded">
                      {request.stage_label}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-2">
                    <div>
                      <p className="text-xs text-gray-500">Dates</p>
                      <p className="font-medium text-gray-900">
                        {new Date(request.start_date).toLocaleDateString()} →{' '}
                        {new Date(request.end_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Duration</p>
                      <p className="font-medium text-gray-900">{request.days_requested} working days</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Submitted</p>
                      <p className="font-medium text-gray-900">
                        {new Date(request.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {request.reason && (
                    <p className="text-sm text-gray-600 italic border-t pt-2">"{request.reason}"</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Details/Decision View
  if (!progress) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setActiveView('queue')}
            className="text-blue-600 hover:text-blue-800 mb-4 font-medium"
          >
            ← Back to Queue
          </button>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">

      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => setActiveView('queue')}
          className="text-blue-600 hover:text-blue-800 mb-6 font-medium"
        >
          ← Back to Queue
        </button>

        {/* Request Summary */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{progress.employee_name}</h1>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-600">Leave Type</p>
              <p className="font-bold text-gray-900">{progress.leave_type_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Duration</p>
              <p className="font-bold text-gray-900">{progress.days_requested} working days</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Period</p>
              <p className="font-bold text-gray-900">
                {new Date(progress.start_date).toLocaleDateString()} →{' '}
                {new Date(progress.end_date).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <p className="font-bold text-gray-900">{progress.status}</p>
            </div>
          </div>
        </div>

        {/* Approval Chain Stepper */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Approval Progress</h2>
          <div className="space-y-4">
            {progress.steps.map((step, index) => (
              <div key={step.key} className="flex items-start gap-4">
                {/* Step Number/Icon */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                      step.state === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : step.state === 'current'
                        ? 'bg-blue-100 text-blue-800'
                        : step.state === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {step.state === 'completed' ? '✓' : step.state === 'rejected' ? '✕' : index + 1}
                  </div>
                  {index < progress.steps.length - 1 && (
                    <div className={`w-0.5 h-12 ${step.state === 'completed' ? 'bg-green-300' : 'bg-gray-300'}`}></div>
                  )}
                </div>

                {/* Step Details */}
                <div className="flex-1 pt-1">
                  <h3 className="font-bold text-gray-900">{step.label}</h3>
                  <p className="text-sm text-gray-600">
                    {step.state === 'completed' && step.decided_at
                      ? `Approved on ${new Date(step.decided_at).toLocaleDateString()}`
                      : step.state === 'current'
                      ? 'Awaiting your decision'
                      : step.state === 'rejected'
                      ? 'Rejected at this stage'
                      : 'Pending'}
                  </p>
                  {step.actor && (
                    <p className="text-xs text-gray-500 mt-1">
                      by {step.actor} {step.actor_role ? `(${step.actor_role})` : ''}
                    </p>
                  )}
                  {step.comment && (
                    <p className="text-sm text-gray-700 mt-2 italic border-l-2 border-gray-300 pl-2">
                      "{step.comment}"
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Decision Panel */}
        {progress.status === 'Pending' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-6">Your Decision</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Action</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDecision({ ...decision, action: 'approve' })}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition ${
                      decision.action === 'approve'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    <CheckCircle className="inline mr-2 w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => setDecision({ ...decision, action: 'changes' })}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition ${
                      decision.action === 'changes'
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    <AlertCircle className="inline mr-2 w-4 h-4" />
                    Request Changes
                  </button>
                  <button
                    onClick={() => setDecision({ ...decision, action: 'reject' })}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition ${
                      decision.action === 'reject'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    <XCircle className="inline mr-2 w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>

              {decision.action !== 'approve' && decision.action !== null && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {decision.action === 'reject' ? 'Reason for Rejection' : 'What Needs to Change'}
                  </label>
                  <textarea
                    value={decision.comment}
                    onChange={(e) => setDecision({ ...decision, comment: e.target.value })}
                    placeholder={
                      decision.action === 'reject'
                        ? 'Explain why you are rejecting this request...'
                        : 'Describe what changes are needed...'
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={4}
                  />
                </div>
              )}

              {decision.action === 'approve' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800">
                    The employee will be notified that their leave has been approved.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleDecision}
                  disabled={!decision.action || isSubmitting}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition"
                >
                  {isSubmitting ? 'Recording Decision...' : 'Record Decision'}
                </button>
                <button
                  onClick={() => setActiveView('queue')}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 font-medium transition"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
