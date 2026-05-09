import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wallet,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Plus,
  X,
  User,
  FileText,
  Calendar,
  Tag,
} from "lucide-react";
import { refundService, paymentService } from "@/services/financeService";
import { studentService } from "@/services/studentService";
import { academicService } from "@/services/academicService";
import { formatCurrency, formatDate } from "@/utils/helpers";
import type {
  RefundStatus,
  RefundCategory,
  CreateRefundPayload,
  FeeRefund,
  FeePayment,
} from "@/types/finance";
import type { Student } from "@/types/academic";
import toast from "react-hot-toast";
import ModalPortal from "@/components/ui/ModalPortal";

const EMPTY_FORM: CreateRefundPayload = {
  student_id: "",
  payment_id: 0,
  amount: 0,
  category: "REFUND",
  reason: "",
  notes: "",
};

// ─── Student search typeahead ─────────────────────────────────────────────────

function StudentSearchField({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (student: Student) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["students-search", query],
    queryFn: () => studentService.list({ q: query, per_page: 8 }),
    enabled: query.trim().length >= 2,
    staleTime: 10_000,
  });

  const students: Student[] = data?.data?.data ?? [];

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (s: Student) => {
    const label = `${s.fname} ${s.lname}${s.regnumber ? ` — ${s.regnumber}` : ""}`;
    setSelectedLabel(label);
    setQuery(label);
    setOpen(false);
    onSelect(s);
  };

  const handleChange = (val: string) => {
    setQuery(val);
    setSelectedLabel("");
    setOpen(true);
  };

  const handleClear = () => {
    setQuery("");
    setSelectedLabel("");
    setOpen(false);
    onSelect({ id: 0, fname: "", lname: "", regnumber: "" } as Student);
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (query.length >= 2) setOpen(true);
          }}
          placeholder="Type name or registration number…"
          className="w-full pl-9 pr-8 py-2 border border-ink-300 dark:border-ink-700 rounded-md text-sm bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-brand"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* selected badge */}
      {value && selectedLabel && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md">
          <User className="w-3 h-3" />
          <span className="font-medium">{selectedLabel}</span>
        </div>
      )}

      {/* dropdown */}
      {open && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {isFetching ? (
            <div className="px-4 py-3 text-sm text-ink-500 text-center">
              Searching…
            </div>
          ) : students.length === 0 ? (
            <div className="px-4 py-3 text-sm text-ink-500 text-center">
              No students found
            </div>
          ) : (
            students.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelect(s)}
                className="w-full text-left px-4 py-2.5 hover:bg-ink-50 dark:hover:bg-ink-700 transition-colors border-b border-ink-100 dark:border-ink-700 last:border-0"
              >
                <div className="text-sm font-medium text-ink-900 dark:text-ink-50">
                  {s.fname} {s.lname}
                </div>
                {s.regnumber && (
                  <div className="text-[11px] text-ink-500 uppercase tracking-wide mt-0.5">
                    {s.regnumber}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Refund detail modal ──────────────────────────────────────────────────────

const CATEGORY_STYLES: Record<string, string> = {
  CAUTION:     'bg-amber-100 text-amber-700 border-amber-200',
  OVERPAYMENT: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  REFUND:      'bg-blue-100 text-blue-700 border-blue-200',
}

function RefundDetailModal({
  refund,
  onClose,
  onReview,
}: {
  refund: FeeRefund
  onClose: () => void
  onReview: () => void
}) {
  const statusConfig = {
    processed: { icon: CheckCircle, label: 'Processed', cls: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    rejected:  { icon: XCircle,    label: 'Rejected',  cls: 'text-red-600 bg-red-50 border-red-200' },
    pending:   { icon: Clock,      label: 'Pending',   cls: 'text-amber-600 bg-amber-50 border-amber-200' },
  }
  const { icon: StatusIcon, label: statusLabel, cls: statusCls } = statusConfig[refund.status]

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-ink-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-ink-100 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand/10 text-brand rounded-xl">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink-900 dark:text-ink-50">Refund Details</h2>
              <p className="text-xs text-ink-500 mt-0.5">#{refund.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-lg transition-colors">
            <X className="w-4 h-4 text-ink-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Student */}
          <div className="flex items-center gap-3 p-3 bg-ink-50 dark:bg-ink-800/60 rounded-xl">
            <div className="w-9 h-9 rounded-full bg-brand/10 text-brand flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                {refund.student_fname
                  ? `${refund.student_fname} ${refund.student_lname}`
                  : refund.student_id}
              </div>
              <div className="text-[11px] text-ink-500 uppercase tracking-wide mt-0.5">{refund.student_id}</div>
            </div>
          </div>

          {/* Amount + Status row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-ink-50 dark:bg-ink-800/60 rounded-xl">
              <div className="text-[10px] text-ink-400 uppercase tracking-wider mb-1">Amount</div>
              <div className="font-mono font-bold text-lg text-ink-900 dark:text-ink-50">{formatCurrency(refund.amount)}</div>
            </div>
            <div className="p-3 bg-ink-50 dark:bg-ink-800/60 rounded-xl">
              <div className="text-[10px] text-ink-400 uppercase tracking-wider mb-1.5">Status</div>
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusCls}`}>
                <StatusIcon className="w-3.5 h-3.5" />
                {statusLabel}
              </div>
            </div>
          </div>

          {/* Category + Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-ink-50 dark:bg-ink-800/60 rounded-xl">
              <div className="text-[10px] text-ink-400 uppercase tracking-wider mb-1.5">Category</div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${CATEGORY_STYLES[refund.category] ?? 'bg-ink-100 text-ink-600'}`}>
                {refund.category}
              </span>
            </div>
            <div className="p-3 bg-ink-50 dark:bg-ink-800/60 rounded-xl">
              <div className="text-[10px] text-ink-400 uppercase tracking-wider mb-1">Recorded</div>
              <div className="flex items-center gap-1.5 text-xs text-ink-700 dark:text-ink-300">
                <Calendar className="w-3.5 h-3.5 text-ink-400" />
                {formatDate(refund.created_at)}
              </div>
            </div>
          </div>

          {/* Reason */}
          <div className="p-3 bg-ink-50 dark:bg-ink-800/60 rounded-xl">
            <div className="text-[10px] text-ink-400 uppercase tracking-wider mb-1">Reason</div>
            <p className="text-sm text-ink-800 dark:text-ink-200">{refund.reason}</p>
          </div>

          {/* Notes */}
          {refund.notes && (
            <div className="p-3 bg-ink-50 dark:bg-ink-800/60 rounded-xl">
              <div className="text-[10px] text-ink-400 uppercase tracking-wider mb-1">Notes</div>
              <p className="text-sm text-ink-600 dark:text-ink-400 italic">{refund.notes}</p>
            </div>
          )}

          {/* Processed by */}
          {refund.processed_by_name && (
            <div className="text-xs text-ink-400 text-center">
              {refund.status === 'rejected' ? 'Rejected' : 'Processed'} by{' '}
              <span className="font-semibold text-ink-600 dark:text-ink-300">{refund.processed_by_name}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="btn btn-secondary flex-1">Close</button>
          {refund.status === 'pending' && (
            <button onClick={onReview} className="btn btn-primary flex-1">
              Review Refund
            </button>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ─── Process / Reject action modal ───────────────────────────────────────────

function ActionModal({
  refund,
  onClose,
  onProcess,
  onReject,
  isProcessing,
  isRejecting,
}: {
  refund: FeeRefund;
  onClose: () => void;
  onProcess: (yearId: number) => void;
  onReject: (reason: string) => void;
  isProcessing: boolean;
  isRejecting: boolean;
}) {
  const [tab, setTab] = useState<"process" | "reject">("process");
  const [yearId, setYearId] = useState<number | "">("");
  const [reason, setReason] = useState("");

  const { data: yearsData } = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => academicService.listYears(),
  });
  const years = yearsData?.data ?? [];

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-ink-900 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-ink-900 dark:text-ink-50">
              Review Refund
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              {refund.student_fname
                ? `${refund.student_fname} ${refund.student_lname}`
                : refund.student_id}
              {" · "}
              {formatCurrency(refund.amount)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-md"
          >
            <X className="w-4 h-4 text-ink-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex rounded-lg bg-ink-100 dark:bg-ink-800 p-1 mb-4">
          <button
            onClick={() => setTab("process")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === "process"
                ? "bg-white dark:bg-ink-700 text-emerald-600 shadow-sm"
                : "text-ink-500 hover:text-ink-700"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" /> Approve
            </span>
          </button>
          <button
            onClick={() => setTab("reject")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === "reject"
                ? "bg-white dark:bg-ink-700 text-red-600 shadow-sm"
                : "text-ink-500 hover:text-ink-700"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" /> Reject
            </span>
          </button>
        </div>

        {tab === "process" ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1">
                Academic Year
              </label>
              <select
                value={yearId}
                onChange={(e) => setYearId(Number(e.target.value))}
                className="w-full px-3 py-2 border border-ink-300 dark:border-ink-700 rounded-md text-sm bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="">Select academic year…</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                    {y.is_current ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                disabled={!yearId || isProcessing}
                onClick={() => yearId && onProcess(yearId as number)}
                className="btn btn-primary bg-emerald-600 hover:bg-emerald-700 border-emerald-600"
              >
                {isProcessing ? "Processing…" : "Approve & Process"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1">
                Reason for rejection
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 border border-ink-300 dark:border-ink-700 rounded-md text-sm bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                placeholder="Explain why this refund is being rejected…"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                disabled={!reason.trim() || isRejecting}
                onClick={() => reason.trim() && onReject(reason)}
                className="btn btn-primary bg-red-600 hover:bg-red-700 border-red-600"
              >
                {isRejecting ? "Rejecting…" : "Reject Refund"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </ModalPortal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RefundsPage() {
  const queryClient = useQueryClient();
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState<RefundStatus | "">("");
  const [category, setCategory] = useState<RefundCategory | "">("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<CreateRefundPayload>(EMPTY_FORM);
  const [selectedPayment, setSelectedPayment] = useState<FeePayment | null>(
    null,
  );
  const [actionRefund, setActionRefund] = useState<FeeRefund | null>(null);
  const [viewRefund, setViewRefund] = useState<FeeRefund | null>(null);

  // Load confirmed payments for the selected student (only when form is open)
  const { data: paymentsQ, isFetching: paymentsLoading } = useQuery({
    queryKey: ["finance", "payments", "confirmed", form.student_id],
    queryFn: () =>
      paymentService.list({
        student_id: form.student_id,
        status: "confirmed",
        per_page: 100,
      }),
    enabled: showForm && form.student_id.trim().length > 0,
  });
  const confirmedPayments: FeePayment[] = paymentsQ?.data?.data ?? [];

  const { data: refundsQ, isLoading } = useQuery({
    queryKey: ["finance", "refunds", { studentId, status, category, page }],
    queryFn: () =>
      refundService.list({
        student_id: studentId || undefined,
        status: status || undefined,
        category: category || undefined,
        page,
      }),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateRefundPayload) => refundService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance", "refunds"] });
      toast.success("Refund recorded successfully");
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
    onError: () => toast.error("Failed to record refund"),
  });

  const processMutation = useMutation({
    mutationFn: ({ id, yearId }: { id: number; yearId: number }) =>
      refundService.process(id, yearId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance", "refunds"] });
      queryClient.invalidateQueries({ queryKey: ["finance", "balance"] });
      queryClient.invalidateQueries({ queryKey: ["finance", "ledger"] });
      queryClient.invalidateQueries({ queryKey: ["finance", "summary"] });
      toast.success("Refund approved and processed");
      setActionRefund(null);
    },
    onError: () => toast.error("Failed to process refund"),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      refundService.reject(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance", "refunds"] });
      toast.success("Refund rejected");
      setActionRefund(null);
    },
    onError: () => toast.error("Failed to reject refund"),
  });

  const refunds = refundsQ?.data?.data ?? [];
  const lastPage = refundsQ?.data?.last_page ?? 1;

  const closeForm = () => {
    setShowForm(false);
    setStep(1);
    setForm(EMPTY_FORM);
    setSelectedPayment(null);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-ink-900 p-6 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-brand/10 text-brand rounded-lg">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink-900 dark:text-ink-50">
              Refund Management
            </h1>
            <p className="text-sm text-ink-500">
              Track and process student refunds and caution money
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Record New Refund
        </button>
      </header>

      {/* Filters */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white dark:bg-ink-900 p-4 rounded-lg border border-ink-200 dark:border-ink-800 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            type="text"
            placeholder="Search Student ID..."
            className="w-full pl-9 pr-4 py-2 bg-ink-50 dark:bg-ink-800 border-none rounded-md text-sm"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          />
        </div>

        <select
          className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border-none rounded-md text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as RefundStatus)}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="processed">Processed</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border-none rounded-md text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value as RefundCategory)}
        >
          <option value="">All Categories</option>
          <option value="REFUND">Direct Refund</option>
          <option value="CAUTION">Caution Money</option>
          <option value="OVERPAYMENT">Overpayment</option>
        </select>

        <button
          onClick={() => {
            setStudentId("");
            setStatus("");
            setCategory("");
          }}
          className="text-sm text-brand font-medium hover:underline flex items-center gap-1 justify-center"
        >
          <Filter className="w-3.5 h-3.5" />
          Reset Filters
        </button>
      </section>

      {/* Results */}
      <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-200 dark:border-ink-800">
              <th className="px-6 py-4 font-semibold">Student & Date</th>
              <th className="px-6 py-4 font-semibold">Category</th>
              <th className="px-6 py-4 font-semibold text-right">Amount</th>
              <th className="px-6 py-4 font-semibold text-center">Status</th>
              <th className="px-6 py-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={5} className="px-6 py-4 h-16 bg-ink-50/50" />
                </tr>
              ))
            ) : refunds.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-ink-500 italic"
                >
                  No refund records found matching filters.
                </td>
              </tr>
            ) : (
              refunds.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setViewRefund(r)}
                  className="hover:bg-ink-50/50 dark:hover:bg-ink-800/30 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4">
                    <div className="font-medium text-ink-900 dark:text-ink-50">
                      {r.student_fname
                        ? `${r.student_fname} ${r.student_lname}`
                        : r.student_id}
                    </div>
                    <div className="text-[11px] text-ink-500 uppercase tracking-wider mt-0.5">
                      {r.student_id} · {formatDate(r.created_at)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded text-[11px] font-bold ${
                        r.category === "CAUTION"
                          ? "bg-amber-100 text-amber-700"
                          : r.category === "OVERPAYMENT"
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {r.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-ink-900 dark:text-ink-50">
                    {formatCurrency(r.amount)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      {r.status === "processed" ? (
                        <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full text-xs font-medium">
                          <CheckCircle className="w-3.5 h-3.5" /> Processed
                        </div>
                      ) : r.status === "rejected" ? (
                        <div className="flex items-center gap-1.5 text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs font-medium">
                          <XCircle className="w-3.5 h-3.5" /> Rejected
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-xs font-medium animate-pulse">
                          <Clock className="w-3.5 h-3.5" /> Pending
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <FileText className="w-4 h-4 text-ink-300 group-hover:text-brand transition-colors ml-auto" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {lastPage > 1 && (
          <div className="px-6 py-4 bg-ink-50/50 border-t border-ink-100 flex items-center justify-between">
            <span className="text-xs text-ink-500">
              Showing page {page} of {lastPage}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn btn-secondary py-1 px-3 text-xs"
              >
                Prev
              </button>
              <button
                disabled={page === lastPage}
                onClick={() => setPage((p) => p + 1)}
                className="btn btn-secondary py-1 px-3 text-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-start gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-lg text-sm border border-blue-100 dark:border-blue-800">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">Important Notice</p>
          <p className="mt-1">
            Processing a refund will automatically deduct the specified amount
            from the student's ledger for the chosen academic year. Ensure the
            student has sufficient caution money or overpayment balance before
            processing.
          </p>
        </div>
      </div>

      {/* ── Detail Modal ────────────────────────────────────────────────── */}
      {viewRefund && (
        <RefundDetailModal
          refund={viewRefund}
          onClose={() => setViewRefund(null)}
          onReview={() => { setActionRefund(viewRefund); setViewRefund(null) }}
        />
      )}

      {/* ── Review Modal ────────────────────────────────────────────────── */}
      {actionRefund && (
        <ActionModal
          refund={actionRefund}
          onClose={() => setActionRefund(null)}
          onProcess={(yearId) =>
            processMutation.mutate({ id: actionRefund.id, yearId })
          }
          onReject={(reason) =>
            rejectMutation.mutate({ id: actionRefund.id, reason })
          }
          isProcessing={processMutation.isPending}
          isRejecting={rejectMutation.isPending}
        />
      )}

      {/* ── New Refund Wizard ────────────────────────────────────────────── */}
      {showForm && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-ink-900 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-8 pt-6 pb-4 border-b border-ink-100 dark:border-ink-800 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-ink-900 dark:text-ink-50">
                  Record New Refund
                </h2>
                <p className="text-xs text-ink-500 mt-0.5">
                  {step === 1
                    ? "Search and select the student"
                    : step === 2
                      ? "Choose the payment to refund against"
                      : "Enter refund details and confirm"}
                </p>
              </div>
              <button
                onClick={closeForm}
                className="p-1.5 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-ink-500" />
              </button>
            </div>

            {/* Step indicators */}
            <div className="flex items-center gap-0 px-8 py-4 flex-shrink-0">
              {(
                ["Select Student", "Choose Payment", "Refund Details"] as const
              ).map((label, idx) => {
                const num = idx + 1;
                const done = step > num;
                const active = step === num;
                return (
                  <div
                    key={num}
                    className="flex items-center flex-1 last:flex-none"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                          done
                            ? "bg-emerald-500 text-white"
                            : active
                              ? "bg-brand text-white"
                              : "bg-ink-100 dark:bg-ink-800 text-ink-400"
                        }`}
                      >
                        {done ? <CheckCircle className="w-4 h-4" /> : num}
                      </div>
                      <span
                        className={`text-xs font-medium hidden sm:block ${
                          active
                            ? "text-ink-900 dark:text-ink-50"
                            : "text-ink-400"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                    {idx < 2 && (
                      <div
                        className={`flex-1 h-px mx-3 transition-colors ${
                          step > num
                            ? "bg-emerald-400"
                            : "bg-ink-200 dark:bg-ink-700"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Step content */}
            <div className="flex-1 overflow-y-auto px-8 pb-2 min-h-[300px]">
              {/* ── Step 1: Student ── */}
              {step === 1 && (
                <div className="py-4 space-y-4">
                  <p className="text-sm text-ink-500">
                    Type a name or registration number to find the student.
                  </p>
                  <StudentSearchField
                    value={form.student_id}
                    onSelect={(s) => {
                      setSelectedPayment(null);
                      setForm((f) => ({
                        ...f,
                        student_id: s.regnumber ?? String(s.id),
                        payment_id: 0,
                        amount: 0,
                      }));
                    }}
                  />
                </div>
              )}

              {/* ── Step 2: Payment ── */}
              {step === 2 && (
                <div className="py-4 space-y-3">
                  <p className="text-sm text-ink-500">
                    Select the confirmed payment this refund is issued against.
                    The refund amount cannot exceed the payment amount.
                  </p>

                  {paymentsLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="h-16 rounded-xl bg-ink-100 dark:bg-ink-800 animate-pulse"
                        />
                      ))}
                    </div>
                  ) : confirmedPayments.length === 0 ? (
                    <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-sm text-amber-700 dark:text-amber-400">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        No confirmed payments found for this student. Only
                        confirmed payments can be refunded.
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {confirmedPayments.map((p) => {
                        const isSelected = form.payment_id === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedPayment(p);
                              setForm((f) => ({
                                ...f,
                                payment_id: p.id,
                                amount: p.amount,
                              }));
                            }}
                            className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all ${
                              isSelected
                                ? "border-brand bg-brand/5 dark:bg-brand/10 shadow-sm"
                                : "border-ink-200 dark:border-ink-700 hover:border-ink-300 dark:hover:border-ink-600"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-3 h-3 rounded-full flex-shrink-0 border-2 transition-colors ${
                                    isSelected
                                      ? "bg-brand border-brand"
                                      : "border-ink-300 dark:border-ink-600"
                                  }`}
                                />
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-ink-900 dark:text-ink-50 truncate">
                                    {p.invoice_description ??
                                      p.invoice_number ??
                                      `Invoice #${p.invoice_id}`}
                                  </div>
                                  <div className="text-[11px] text-ink-500 mt-0.5">
                                    {p.receipt_number} &nbsp;·&nbsp;{" "}
                                    {formatDate(p.paid_at)} &nbsp;·&nbsp;{" "}
                                    {p.payment_method}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="font-mono font-bold text-base text-ink-900 dark:text-ink-50">
                                  {formatCurrency(p.amount)}
                                </div>
                                <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                                  Confirmed
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 3: Details ── */}
              {step === 3 && selectedPayment && (
                <div className="py-4 grid grid-cols-2 gap-x-6 gap-y-4">
                  {/* Selected payment summary */}
                  <div className="col-span-2 flex items-center gap-4 p-4 bg-ink-50 dark:bg-ink-800/60 rounded-xl border border-ink-200 dark:border-ink-700">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-ink-500 mb-0.5">
                        Refunding against
                      </div>
                      <div className="text-sm font-semibold text-ink-900 dark:text-ink-50 truncate">
                        {selectedPayment.invoice_description ??
                          selectedPayment.invoice_number ??
                          `Invoice #${selectedPayment.invoice_id}`}
                      </div>
                      <div className="text-[11px] text-ink-500 mt-0.5">
                        {selectedPayment.receipt_number} ·{" "}
                        {formatDate(selectedPayment.paid_at)}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs text-ink-500 mb-0.5">
                        Original payment
                      </div>
                      <div className="font-mono font-bold text-ink-900 dark:text-ink-50">
                        {formatCurrency(selectedPayment.amount)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStep(2);
                        setSelectedPayment(null);
                        setForm((f) => ({ ...f, payment_id: 0, amount: 0 }));
                      }}
                      className="text-xs text-brand hover:underline flex-shrink-0"
                    >
                      Change
                    </button>
                  </div>

                  {/* Amount */}
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1">
                      Refund Amount (RWF)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        min={1}
                        max={selectedPayment.amount}
                        value={form.amount || ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setForm((f) => ({
                            ...f,
                            amount: Math.min(val, selectedPayment.amount),
                          }));
                        }}
                        className="w-full px-3 py-2 border border-ink-300 dark:border-ink-700 rounded-lg text-sm bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-brand"
                      />
                    </div>
                    <p
                      className={`text-[11px] mt-1 ${form.amount > 0 && form.amount < selectedPayment.amount ? "text-amber-600" : "text-ink-400"}`}
                    >
                      {form.amount > 0 && form.amount < selectedPayment.amount
                        ? `Partial refund — ${formatCurrency(selectedPayment.amount - form.amount)} will remain`
                        : `Max: ${formatCurrency(selectedPayment.amount)}`}
                    </p>
                  </div>

                  {/* Category */}
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1">
                      Category
                    </label>
                    <select
                      value={form.category}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          category: e.target.value as RefundCategory,
                        }))
                      }
                      className="w-full px-3 py-2 border border-ink-300 dark:border-ink-700 rounded-lg text-sm bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-brand"
                    >
                      <option value="REFUND">Direct Refund</option>
                      <option value="CAUTION">Caution Money</option>
                      <option value="OVERPAYMENT">Overpayment</option>
                    </select>
                  </div>

                  {/* Reason */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1">
                      Reason
                    </label>
                    <input
                      type="text"
                      required
                      value={form.reason}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, reason: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-ink-300 dark:border-ink-700 rounded-lg text-sm bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-brand"
                      placeholder="Brief reason for this refund…"
                    />
                  </div>

                  {/* Notes */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1">
                      Notes{" "}
                      <span className="text-ink-400 font-normal">
                        (optional)
                      </span>
                    </label>
                    <textarea
                      rows={3}
                      value={form.notes ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, notes: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-ink-300 dark:border-ink-700 rounded-lg text-sm bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                      placeholder="Any additional context…"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer navigation */}
            <div className="flex items-center justify-between px-8 py-5 border-t border-ink-100 dark:border-ink-800 flex-shrink-0">
              <button
                type="button"
                onClick={() =>
                  step === 1 ? closeForm() : setStep((s) => s - 1)
                }
                className="btn btn-secondary"
              >
                {step === 1 ? "Cancel" : "← Back"}
              </button>

              {step < 3 ? (
                <button
                  type="button"
                  disabled={step === 1 ? !form.student_id : !form.payment_id}
                  onClick={() => setStep((s) => s + 1)}
                  className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  disabled={
                    createMutation.isPending ||
                    form.amount <= 0 ||
                    !form.reason.trim()
                  }
                  onClick={() => {
                    if (selectedPayment && form.amount > selectedPayment.amount)
                      return toast.error(
                        `Cannot refund more than ${formatCurrency(selectedPayment.amount)}`,
                      );
                    createMutation.mutate(form);
                  }}
                  className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createMutation.isPending ? "Saving…" : "Record Refund"}
                </button>
              )}
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}
