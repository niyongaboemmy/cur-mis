import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Search, CheckCircle2, X, Eye } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/services/api";
import Pagination from "@/components/ui/Pagination";

interface Student {
  student_id: string;
  regnumber: string;
  fname: string;
  lname: string;
  student_state: string;
  intake: string;
  faculty?: string;
  department?: string;
  opening_balance: number;
  invoiced: number;
  paid: number;
  bursary: number;
  total_balance: number;
}

interface BillingResponse {
  data: Student[];
  total: number;
  current_page: number;
  per_page: number;
  last_page: number;
}

type SortField = "opening_balance" | "invoiced" | "paid" | "bursary" | "total_balance" | "fname";

const formatRWF = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "RWF",
    minimumFractionDigits: 0,
  }).format(value);

const calculateTotals = (students: Student[]) => ({
  opening: students.reduce((sum, s) => sum + (s.opening_balance || 0), 0),
  invoiced: students.reduce((sum, s) => sum + (s.invoiced || 0), 0),
  paid: students.reduce((sum, s) => sum + (s.paid || 0), 0),
  bursary: students.reduce((sum, s) => sum + (s.bursary || 0), 0),
  balance: students.reduce((sum, s) => sum + (s.total_balance || 0), 0),
});

interface SummaryCardProps {
  label: string;
  amount: number;
  color?: string;
}

const SummaryCard = ({ label, amount, color = "text-ink-900 dark:text-white" }: SummaryCardProps) => (
  <div className="card card-pad">
    <div className="text-sm text-ink-500">{label}</div>
    <div className={`text-2xl font-bold ${color}`}>{formatRWF(amount)}</div>
  </div>
);

interface FiltersProps {
  keyword: string;
  onKeywordChange: (value: string) => void;
  studentState: string | number;
  onStateChange: (value: string | number) => void;
}

const Filters = ({ keyword, onKeywordChange, studentState, onStateChange }: FiltersProps) => (
  <div className="card card-pad space-y-4">
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">Student Status</label>
        <select
          value={String(studentState)}
          onChange={(e) => onStateChange(e.target.value)}
          className="w-full px-4 py-2 border border-ink-200 dark:border-ink-600 rounded-lg bg-white dark:bg-ink-800"
        >
          <option value="all">All Students</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-2">Search</label>
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-ink-400" />
          <input
            type="text"
            placeholder="Name or Reg #..."
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-ink-200 dark:border-ink-600 rounded-lg bg-white dark:bg-ink-800"
          />
        </div>
      </div>
    </div>
  </div>
);

interface TableHeaderProps {
  selectAll: boolean;
  onSelectAllChange: (checked: boolean) => void;
  sortField: SortField;
  sortOrder: "asc" | "desc";
  onSort: (field: SortField) => void;
}

const TableHeader = ({ selectAll, onSelectAllChange, sortField, sortOrder, onSort }: TableHeaderProps) => {
  const SortIndicator = ({ field }: { field: SortField }) =>
    sortField === field && <span className="ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>;

  const SortableHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="px-4 py-3 text-right font-medium cursor-pointer hover:bg-ink-100 dark:hover:bg-ink-700"
      onClick={() => onSort(field)}
    >
      {label}
      <SortIndicator field={field} />
    </th>
  );

  return (
    <thead>
      <tr className="border-b border-ink-200 dark:border-ink-700">
        <th className="px-4 py-3 text-left">
          <input type="checkbox" checked={selectAll} onChange={(e) => onSelectAllChange(e.target.checked)} className="w-4 h-4" />
        </th>
        <th className="px-4 py-3 text-left font-medium">Name</th>
        <th className="px-4 py-3 text-left font-medium">Reg #</th>
        <th className="px-4 py-3 text-left font-medium">Status</th>
        <th className="px-4 py-3 text-left font-medium">Intake</th>
        <SortableHeader field="opening_balance" label="Opening Balance" />
        <SortableHeader field="invoiced" label="Invoiced" />
        <SortableHeader field="paid" label="Paid" />
        <SortableHeader field="bursary" label="Bursary" />
        <SortableHeader field="total_balance" label="Remaining" />
      </tr>
    </thead>
  );
};

interface StudentRowProps {
  student: Student;
  selected: boolean;
  onToggle: () => void;
  onViewDetails: (student: Student) => void;
}

const StudentRow = ({ student, selected, onToggle, onViewDetails }: StudentRowProps) => (
  <tr className="border-b border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-900">
    <td className="px-4 py-3">
      <input type="checkbox" checked={selected} onChange={onToggle} className="w-4 h-4" />
    </td>
    <td className="px-4 py-3">
      <button
        onClick={() => onViewDetails(student)}
        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 hover:underline flex items-center gap-2"
        title="View student details"
      >
        <Eye className="w-4 h-4" />
        {student.fname} {student.lname}
      </button>
    </td>
    <td className="px-4 py-3 font-mono text-xs">{student.regnumber}</td>
    <td className="px-4 py-3">
      <span
        className={`px-2 py-1 rounded text-xs font-medium ${
          student.student_state === "active"
            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
            : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
        }`}
      >
        {student.student_state}
      </span>
    </td>
    <td className="px-4 py-3 text-sm">{student.intake}</td>
    <td className="px-4 py-3 text-right">{formatRWF(student.opening_balance)}</td>
    <td className="px-4 py-3 text-right">{formatRWF(student.invoiced)}</td>
    <td className="px-4 py-3 text-right text-green-600">{formatRWF(student.paid)}</td>
    <td className="px-4 py-3 text-right text-blue-600">{formatRWF(student.bursary)}</td>
    <td className="px-4 py-3 text-right font-medium text-orange-600">{formatRWF(student.total_balance)}</td>
  </tr>
);

interface StudentsTableProps {
  students: Student[];
  isLoading: boolean;
  selectedStudents: Set<string>;
  selectAll: boolean;
  sortField: SortField;
  sortOrder: "asc" | "desc";
  page: number;
  perPage: number;
  totalItems: number;
  lastPage: number;
  onToggleStudent: (id: string) => void;
  onSelectAll: (checked: boolean) => void;
  onSort: (field: SortField) => void;
  onPageChange: (page: number) => void;
  onViewDetails: (student: Student) => void;
}

const StudentsTable = ({
  students,
  isLoading,
  selectedStudents,
  selectAll,
  sortField,
  sortOrder,
  page,
  perPage,
  totalItems,
  lastPage,
  onToggleStudent,
  onSelectAll,
  onSort,
  onPageChange,
  onViewDetails,
}: StudentsTableProps) => {
  if (isLoading) {
    return (
      <div className="card card-pad">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-ink-400" />
        </div>
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="card card-pad">
        <div className="text-center py-12">
          <p className="text-ink-500">No students found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card card-pad overflow-x-auto">
      <table className="w-full text-sm">
        <TableHeader selectAll={selectAll} onSelectAllChange={onSelectAll} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
        <tbody>
          {students.map((student) => (
            <StudentRow
              key={student.student_id}
              student={student}
              selected={selectedStudents.has(student.student_id)}
              onToggle={() => onToggleStudent(student.student_id)}
              onViewDetails={onViewDetails}
            />
          ))}
        </tbody>
      </table>
      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm text-ink-600 dark:text-ink-400">
          Showing {(page - 1) * perPage + 1} to {Math.min(page * perPage, totalItems)} of {totalItems} students
        </div>
        <Pagination currentPage={page} lastPage={lastPage} total={totalItems} perPage={perPage} onPageChange={onPageChange} />
      </div>
    </div>
  );
};

interface StudentDetailsModalProps {
  student: Student | null;
  isOpen: boolean;
  onClose: () => void;
}

const StudentDetailsModal = ({ student, isOpen, onClose }: StudentDetailsModalProps) => {
  const [sponsors, setSponsors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && student) {
      setLoading(true);
      api.get(`/api/finance/sponsors?student_id=${student.student_id}`)
        .then((res) => setSponsors((res.data as any) || []))
        .catch(() => setSponsors([]))
        .finally(() => setLoading(false));
    }
  }, [isOpen, student]);

  if (!isOpen || !student) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-ink-800 rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-y-auto">
        <div className="sticky top-0 bg-ink-50 dark:bg-ink-700 border-b border-ink-200 dark:border-ink-600 p-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">
            Student Details: {student.fname} {student.lname}
          </h2>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-600 dark:hover:text-ink-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-ink-500 dark:text-ink-400">Registration Number</label>
              <p className="text-base font-semibold text-ink-900 dark:text-white">{student.regnumber}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-500 dark:text-ink-400">Status</label>
              <p className={`text-base font-semibold ${student.student_state === "active" ? "text-green-600" : "text-gray-600"}`}>
                {student.student_state}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-500 dark:text-ink-400">Intake</label>
              <p className="text-base font-semibold text-ink-900 dark:text-white">{student.intake}</p>
            </div>
          </div>

          <div className="border-t border-ink-200 dark:border-ink-600 pt-4">
            <h3 className="font-bold text-ink-900 dark:text-white mb-4">📊 Opening Balance & Financial Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900 p-3 rounded">
                <div className="text-xs text-blue-600 dark:text-blue-300">Opening Balance</div>
                <div className="text-lg font-bold text-blue-900 dark:text-blue-100">{formatRWF(student.opening_balance)}</div>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900 p-3 rounded">
                <div className="text-xs text-purple-600 dark:text-purple-300">Invoiced</div>
                <div className="text-lg font-bold text-purple-900 dark:text-purple-100">{formatRWF(student.invoiced)}</div>
              </div>
              <div className="bg-green-50 dark:bg-green-900 p-3 rounded">
                <div className="text-xs text-green-600 dark:text-green-300">Paid</div>
                <div className="text-lg font-bold text-green-900 dark:text-green-100">{formatRWF(student.paid)}</div>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900 p-3 rounded">
                <div className="text-xs text-orange-600 dark:text-orange-300">Total Balance</div>
                <div className="text-lg font-bold text-orange-900 dark:text-orange-100">{formatRWF(student.total_balance)}</div>
              </div>
            </div>
          </div>

          <div className="border-t border-ink-200 dark:border-ink-600 pt-4">
            <h3 className="font-bold text-ink-900 dark:text-white mb-4">👥 Sponsors</h3>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-ink-400" />
              </div>
            ) : sponsors.length > 0 ? (
              <div className="space-y-2">
                {sponsors.map((sponsor: any, idx: number) => (
                  <div key={idx} className="bg-ink-50 dark:bg-ink-700 p-3 rounded border border-ink-200 dark:border-ink-600">
                    <div className="font-medium text-ink-900 dark:text-white">{sponsor.name || sponsor.sponsor_name || "Unknown"}</div>
                    {sponsor.amount && <div className="text-sm text-ink-600 dark:text-ink-400">Amount: {formatRWF(sponsor.amount)}</div>}
                    {sponsor.sponsorship_type && <div className="text-sm text-ink-600 dark:text-ink-400">Type: {sponsor.sponsorship_type}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-ink-500 dark:text-ink-400 text-sm">No sponsors assigned</p>
            )}
          </div>

          <div className="border-t border-ink-200 dark:border-ink-600 pt-4">
            <h3 className="font-bold text-ink-900 dark:text-white mb-4">📋 Actions</h3>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (student) {
                    api.post(`/api/finance/students/generate`, {
                      student_id: student.student_id,
                      academic_year_id: 0
                    }).then(() => {
                      toast.success(`✅ Invoice generated for ${student.fname} ${student.lname}`);
                    }).catch((err: any) => {
                      toast.error(`❌ ${err.response?.data?.message || 'Failed to generate invoice'}`);
                    });
                  }
                }}
                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition"
              >
                Generate Invoice
              </button>
              <button
                onClick={() => {
                  if (student) {
                    import('../../services/financeService').then(({ feeInvoicePdfService }) => {
                      feeInvoicePdfService.downloadStudentBillPdf(student.student_id, {
                        academic_year_id: 0,
                        semester: undefined
                      }).catch(() => {
                        toast.error('❌ Failed to download bill');
                      });
                    });
                  }
                }}
                className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition"
              >
                Download Bill PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface BulkActionProps {
  count: number;
  isGenerating: boolean;
  onGenerate: () => void;
}

const BulkActionBar = ({ count, isGenerating, onGenerate }: BulkActionProps) => (
  <div className="card card-pad bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 sticky bottom-6">
    <div className="flex items-center justify-between">
      <div className="text-lg font-medium">✅ {count} student{count !== 1 ? "s" : ""} selected</div>
      <button
        onClick={onGenerate}
        disabled={isGenerating}
        className="btn btn-primary flex items-center gap-2"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Generate Invoices
          </>
        )}
      </button>
    </div>
  </div>
);

export default function StudentBillingPage() {
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [studentState, setStudentState] = useState<string | number>("all");
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("opening_balance");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);

  const perPage = 50;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [keyword]);

  const studentsQ = useQuery({
    queryKey: ["billing-students", studentState, debouncedKeyword, page, sortField, sortOrder],
    queryFn: async () => {
      const params = {
        state: String(studentState),
        keyword: debouncedKeyword || "",
        page: String(page),
        per_page: String(perPage),
        sort: sortField,
        order: sortOrder,
      };
      const response = await api.get<BillingResponse>('/api/finance/billing/all-students', { params });
      return response.data;
    },
    retry: 2,
    staleTime: 30000,
  });

  const paginated = studentsQ.data as BillingResponse | undefined;
  const students: Student[] = paginated?.data ?? [];
  const totalItems = paginated?.total ?? 0;
  const lastPage = paginated?.last_page ?? 1;
  const totals = useMemo(() => calculateTotals(students), [students]);

  useEffect(() => {
    if (selectAll && students.length > 0) {
      const newSelected = new Set(selectedStudents);
      students.forEach((s) => newSelected.add(s.student_id));
      setSelectedStudents(newSelected);
    }
  }, [students, selectAll]);

  const toggleStudent = (studentId: string) => {
    const newSelected = new Set(selectedStudents);
    newSelected.has(studentId) ? newSelected.delete(studentId) : newSelected.add(studentId);
    setSelectedStudents(newSelected);
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (selectedStudents.size === 0) throw new Error("Please select at least one student");
      return api.post("/api/finance/billing/bulk-generate", { student_ids: Array.from(selectedStudents) });
    },
    onSuccess: () => {
      toast.success(`✅ Invoices generated for ${selectedStudents.size} students`);
      setSelectedStudents(new Set());
      setSelectAll(false);
      studentsQ.refetch();
    },
    onError: (err: any) => {
      toast.error(`❌ ${err.message || "Failed to generate invoices"}`);
    },
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink-900 dark:text-white">📊 Bulk Billing Management</h1>
          <p className="text-ink-500">View all students and their financial data. Select and bill in bulk.</p>
        </div>
        <button
          onClick={() => setIsBillingModalOpen(true)}
          className="btn btn-primary"
        >
          📋 Open Billing Interface
        </button>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <SummaryCard label="Opening Balance" amount={totals.opening} />
        <SummaryCard label="Invoiced" amount={totals.invoiced} />
        <SummaryCard label="Paid" amount={totals.paid} color="text-green-600" />
        <SummaryCard label="Bursary" amount={totals.bursary} color="text-blue-600" />
        <SummaryCard label="Remaining" amount={totals.balance} color="text-orange-600" />
      </div>

      <Filters
        keyword={keyword}
        onKeywordChange={setKeyword}
        studentState={studentState}
        onStateChange={setStudentState}
      />

      <StudentsTable
        students={students}
        isLoading={studentsQ.isLoading}
        selectedStudents={selectedStudents}
        selectAll={selectAll}
        sortField={sortField}
        sortOrder={sortOrder}
        page={page}
        perPage={perPage}
        totalItems={totalItems}
        lastPage={lastPage}
        onToggleStudent={toggleStudent}
        onSelectAll={(checked) => {
          setSelectAll(checked);
          if (!checked) setSelectedStudents(new Set());
        }}
        onSort={toggleSort}
        onPageChange={setPage}
        onViewDetails={(student) => {
          setSelectedStudent(student);
          setIsModalOpen(true);
        }}
      />

      {selectedStudents.size > 0 && (
        <BulkActionBar
          count={selectedStudents.size}
          isGenerating={generateMutation.isPending}
          onGenerate={() => generateMutation.mutate()}
        />
      )}

      <StudentDetailsModal
        student={selectedStudent}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedStudent(null);
        }}
      />

      {/* Billing Interface Modal */}
      {isBillingModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="w-full h-full flex">
            {/* Close button on top right */}
            <button
              onClick={() => setIsBillingModalOpen(false)}
              className="absolute top-4 right-4 z-60 bg-white dark:bg-ink-800 rounded-full p-2 shadow-lg hover:bg-ink-100 dark:hover:bg-ink-700"
            >
              <X className="w-6 h-6 text-ink-900 dark:text-white" />
            </button>
            {/* Full-screen iframe */}
            <iframe
              src="/umis/finance/billing/index.php"
              className="w-full h-full border-none"
              title="Billing Interface"
            />
          </div>
        </div>
      )}
    </div>
  );
}
