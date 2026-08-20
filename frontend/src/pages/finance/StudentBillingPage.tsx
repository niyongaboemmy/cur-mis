import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2,
  Search,
  Filter,
  Users,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
} from "lucide-react";

import toast from "react-hot-toast";
import { billingService } from "@/services/financeService";
import { api } from "@/services/api";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Pagination from "@/components/ui/Pagination";

const formatRWF = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "RWF",
    minimumFractionDigits: 0,
  }).format(value);
};

interface Student {
  regnumber: string;
  fname: string;
  lname: string;
  faculty: string;
  department: string;
  student_state: string;
  intake: string;
  opening_balance: number;
  invoiced: number;
  paid: number;
  bursary: number;
  total_balance: number;
}

type SortField = "name" | "opening_balance" | "total_balance" | "invoiced" | "paid" | "intake" | "faculty";

export default function StudentBillingPage() {
  const [academicYear, setAcademicYear] = useState("");
  const [studentState, setStudentState] = useState<"all" | "active" | "inactive">("all");
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("opening_balance");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const perPage = 50;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [keyword]);

  // Fetch academic years
  const academicYearsQ = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => api.get<any>("/api/academics-management/academic-years"),
  });
  const academicYears = academicYearsQ.data?.data?.data ?? [];

  // Fetch students with financial data
  const studentsQ = useQuery({
    queryKey: ["students-billing", academicYear, studentState, debouncedKeyword, page, sortField, sortOrder],
    queryFn: () => {
      const params: any = {
        page,
        per_page: perPage,
        sort: sortField,
        order: sortOrder,
      };

      if (academicYear) params.academic_year_id = academicYear;
      if (studentState !== "all") params.state = studentState;
      if (debouncedKeyword) params.keyword = debouncedKeyword;

      return api.get<any>("/api/finance/billing/all-students", params);
    },
  });

  const paginated = studentsQ.data?.data as any;
  const students: Student[] = paginated?.data ?? [];
  const totalItems = paginated?.total ?? 0;
  const lastPage = paginated?.last_page ?? 1;

  useEffect(() => {
    if (students.length > 0 && selectedStudents.size === students.length) {
      setSelectAll(true);
    } else {
      setSelectAll(false);
    }
  }, [students, selectedStudents]);

  // Bulk generation mutation
  const bulkMutation = useMutation({
    mutationFn: (studentIds: string[]) => {
      if (studentIds.length === 0) {
        throw new Error("Please select at least one student");
      }
      return billingService.bulkGenerate({
        academic_year_id: parseInt(academicYear),
        student_ids: studentIds,
      });
    },
    onSuccess: (res: any) => {
      const data = res.data;
      const parts = [
        `Students processed: ${data.processed_students}`,
        `New invoices: ${data.total_created}`,
        data.total_updated > 0 ? `Updated: ${data.total_updated}` : null,
        `Unchanged: ${data.total_skipped}`,
      ]
        .filter(Boolean)
        .join(" · ");
      toast.success(`✅ Bulk generation complete! ${parts}`, { duration: 6000 });
      setSelectedStudents(new Set());
      setSelectAll(false);
      studentsQ.refetch();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Bulk generation failed"),
  });

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedStudents(new Set());
      setSelectAll(false);
    } else {
      setSelectedStudents(new Set(students.map((s) => s.regnumber)));
      setSelectAll(true);
    }
  };

  const handleSelectStudent = (regnumber: string) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(regnumber)) {
      newSelected.delete(regnumber);
    } else {
      newSelected.add(regnumber);
    }
    setSelectedStudents(newSelected);
  };

  const handleBillAll = () => {
    const msg = `Generate invoices for ${selectedStudents.size} selected student${selectedStudents.size !== 1 ? "s" : ""}?`;

    if (confirm(msg)) {
      bulkMutation.mutate(Array.from(selectedStudents));
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortOrder === "asc" ? (
      <ChevronUp className="w-3 h-3" />
    ) : (
      <ChevronDown className="w-3 h-3" />
    );
  };

  return (
    <div className="space-y-4 animate-fade-in pb-12 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-ink-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-brand" />
            Bulk Billing Management
          </h2>
          <p className="text-sm text-ink-500 mt-1">
            Student balances and group invoicing overview.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Academic Year */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">
              Academic Year
            </label>
            <SearchableSelect
              options={academicYears.map((y: any) => ({
                value: y.academic_year_id,
                label: `${y.year_name}`,
              }))}
              value={academicYear}
              onChange={(v) => {
                setAcademicYear(String(v));
                setPage(1);
              }}
              placeholder="Select year..."
              allLabel="All years"
            />
          </div>

          {/* Student State */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">
              Student Status
            </label>
            <select
              value={studentState}
              onChange={(e) => {
                setStudentState(e.target.value as any);
                setPage(1);
              }}
              className="input input-sm w-full"
            >
              <option value="all">All Students</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">
              Search Students
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300" />
              <input
                className="input input-sm pl-9 w-full"
                placeholder="Name or Reg #…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Action */}
      {selectedStudents.size > 0 && (
        <div className="card p-4 bg-gradient-to-r from-green-500/5 to-emerald-500/5 border border-green-500/20 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-ink-900 dark:text-white">
                {selectedStudents.size} Student{selectedStudents.size !== 1 ? "s" : ""} Selected
              </p>
              <p className="text-[12px] text-ink-500">
                Ready to generate invoices for selected students
              </p>
            </div>
          </div>
          <button
            className="btn-primary btn-sm flex items-center gap-1.5 px-4 shrink-0"
            onClick={handleBillAll}
            disabled={bulkMutation.isPending}
          >
            {bulkMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            {bulkMutation.isPending ? "Generating..." : "Generate Invoices"}
          </button>
        </div>
      )}

      {!academicYear && (
        <div className="card p-8 text-center">
          <Filter className="w-12 h-12 text-ink-200 mx-auto mb-4" />
          <p className="text-ink-600 dark:text-ink-400">Please select an academic year to view students</p>
        </div>
      )}

      {/* Student Table */}
      {academicYear && (
        <div className="card overflow-hidden shadow-sm">
          {/* Header */}
          <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between gap-3 flex-wrap bg-ink-50/50 dark:bg-ink-900/20">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-ink-400" />
              <span className="text-xs font-bold uppercase tracking-widest text-ink-500">Students</span>
              <span className="bg-brand/10 text-brand px-2 py-0.5 rounded-full text-[10px] font-bold">
                {totalItems.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Content */}
          {studentsQ.isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 text-brand animate-spin" />
              <p className="text-sm text-ink-400">Loading students…</p>
            </div>
          ) : students.length === 0 ? (
            <div className="py-20 text-center space-y-2">
              <Users className="w-10 h-10 text-ink-200 mx-auto mb-2" />
              <p className="font-bold text-ink-800 dark:text-white">No students found</p>
              <p className="text-ink-400 text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ink-50/60 dark:bg-ink-800/40 border-b border-ink-100 dark:border-ink-700">
                    <th className="px-4 py-3 text-center w-12">
                      <input
                        type="checkbox"
                        checked={selectAll && students.length > 0}
                        onChange={handleSelectAll}
                        className="checkbox checkbox-sm"
                      />
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-ink-100 dark:hover:bg-ink-700 group"
                      onClick={() => toggleSort("name")}
                    >
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">
                        Student Name
                        <SortIcon field="name" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-ink-400">
                      Reg #
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-ink-400 cursor-pointer hover:bg-ink-100 dark:hover:bg-ink-700"
                      onClick={() => toggleSort("opening_balance")}>
                      <div className="flex items-center justify-end gap-2">
                        Opening Balance
                        <SortIcon field="opening_balance" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-ink-400 cursor-pointer hover:bg-ink-100 dark:hover:bg-ink-700"
                      onClick={() => toggleSort("invoiced")}>
                      <div className="flex items-center justify-end gap-2">
                        Invoiced
                        <SortIcon field="invoiced" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-ink-400 cursor-pointer hover:bg-ink-100 dark:hover:bg-ink-700"
                      onClick={() => toggleSort("paid")}>
                      <div className="flex items-center justify-end gap-2">
                        Paid
                        <SortIcon field="paid" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-ink-400">
                      Bursary
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-ink-400 cursor-pointer hover:bg-ink-100 dark:hover:bg-ink-700"
                      onClick={() => toggleSort("total_balance")}>
                      <div className="flex items-center justify-end gap-2">
                        Total Balance
                        <SortIcon field="total_balance" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50 dark:divide-ink-800/60">
                  {students.map((s) => (
                    <tr key={s.regnumber} className="hover:bg-brand/[0.025] dark:hover:bg-brand/[0.04]">
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedStudents.has(s.regnumber)}
                          onChange={() => handleSelectStudent(s.regnumber)}
                          className="checkbox checkbox-sm"
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink-900 dark:text-white">
                        {s.fname} {s.lname}
                      </td>
                      <td className="px-4 py-3 text-ink-500 font-mono text-xs">{s.regnumber}</td>
                      <td className="px-4 py-3 text-right text-ink-900 dark:text-white font-semibold">
                        {formatRWF(s.opening_balance)}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-600 dark:text-ink-400">
                        {formatRWF(s.invoiced)}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
                        {formatRWF(s.paid)}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400">
                        {formatRWF(s.bursary)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-ink-900 dark:text-white">
                        {formatRWF(s.total_balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalItems > perPage && (
            <div className="px-5 py-4 border-t border-ink-100 dark:border-ink-700 flex justify-center bg-ink-50/30 dark:bg-ink-900/20">
              <Pagination
                currentPage={page}
                lastPage={lastPage}
                total={totalItems}
                perPage={perPage}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
