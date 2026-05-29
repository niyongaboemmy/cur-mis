import { api, apiClient } from "@/services/api";
import type { PaginatedResponse } from "@/types";
import type {
  FeeStructure,
  FeeInvoice,
  FeePayment,
  FeeBursary,
  ReceiptData,
  StudentLedger,
  FinanceSummary,
  RevenueByType,
  CreateFeeStructurePayload,
  CreateInvoicePayload,
  GenerateInvoicesPayload,
  GenerateInvoicesResult,
  RecordPaymentPayload,
  RecordPaymentResult,
  CreateBursaryPayload,
  Expense,
  ExpenseCategory,
  CreateExpensePayload,
  ExpenseBudget,
  SaveBudgetPayload,
  ClearanceResult,
  StudentClearance,
  ClearanceReport,
  IncomeProjection,
  AccountBalance,
  BillingSummary,
  MonthlyCollection,
  Sponsor,
  CreateSponsorPayload,
  StudentFeeOverride,
  CreateOverridePayload,
  FeeRefund,
  CreateRefundPayload,
  RefundStatus,
  RefundCategory,
  CreateBursaryBulkPayload,
  MobilePaymentRecord,
} from "@/types/finance";

// ─── Fee Structures ───────────────────────────────────────────────────────────

export const feeStructureService = {
  list: (
    params?: {
      academic_year_id?: number;
      department_id?: number | null;
      level_id?: number | null;
      fee_type?: string;
      is_active?: 0 | 1;
    },
    signal?: AbortSignal,
  ) => api.get<FeeStructure[]>("/api/finance/structures", params ?? {}, signal),

  create: (data: CreateFeeStructurePayload) =>
    api.post<{ id: number }>("/api/finance/structures", data),

  update: (
    id: number,
    data: Partial<CreateFeeStructurePayload> & { is_active?: 0 | 1 },
  ) => api.put<null>(`/api/finance/structures/${id}`, data),

  delete: (id: number) => api.delete<null>(`/api/finance/structures/${id}`),
};

// ─── Student Ledger & Invoice Generation ─────────────────────────────────────

export const ledgerService = {
  getStudentLedger: (
    studentId: string,
    params?: { academic_year_id?: number },
    signal?: AbortSignal,
  ) =>
    api.get<StudentLedger>(
      "/api/finance/students/invoices",
      { student_id: studentId, ...params },
      signal,
    ),

  generateInvoices: (studentId: string, data: GenerateInvoicesPayload) =>
    api.post<GenerateInvoicesResult>("/api/finance/students/generate", {
      student_id: studentId,
      ...data,
    }),

  createInvoice: (data: CreateInvoicePayload) =>
    api.post<{ id: number }>("/api/finance/invoices", data),

  updateInvoice: (
    id: number,
    data: Partial<
      Pick<FeeInvoice, "description" | "amount_due" | "due_date" | "status">
    >,
  ) => api.put<null>(`/api/finance/invoices/${id}`, data),
};

// ─── Payments ─────────────────────────────────────────────────────────────────

export const paymentService = {
  list: (
    params?: {
      student_id?: string;
      payment_method?: string;
      status?: string;
      from_date?: string;
      to_date?: string;
      page?: number;
      per_page?: number;
    },
    signal?: AbortSignal,
  ) =>
    api.get<PaginatedResponse<FeePayment>>(
      "/api/finance/payments",
      params ?? {},
      signal,
    ),

  getOnlinePaymentsHistory: (
    params?: {
      keyword?: string;
      page?: number;
      per_page?: number;
    },
    signal?: AbortSignal,
  ) =>
    api.get<{
      data: any[];
      pagination: {
        current_page: number;
        per_page: number;
        total: number;
        last_page: number;
      };
      metrics: {
        total_transactions: number;
        total_amount: number;
      };
    }>("/api/finance/online-payments", params ?? {}, signal),

  record: (data: RecordPaymentPayload & { payment_sub_method?: string }) =>
    api.post<RecordPaymentResult>("/api/finance/payments", data),

  getReceipt: (paymentId: number, signal?: AbortSignal) =>
    api.get<ReceiptData>(
      `/api/finance/payments/${paymentId}/receipt`,
      {},
      signal,
    ),

  approve: (id: number, options?: { invoice_id?: number }) =>
    api.patch<null>(`/api/finance/payments/${id}/approve`, options ?? {}),

  reject: (id: number, reason?: string) =>
    api.patch<null>(`/api/finance/payments/${id}/reject`, { reason }),

  getPendingCount: (signal?: AbortSignal) =>
    api.get<{ count: number }>(
      "/api/finance/payments/pending-count",
      {},
      signal,
    ),
};

// ─── Bursaries ────────────────────────────────────────────────────────────────

export const bursaryService = {
  list: (
    params?: {
      student_id?: string;
      academic_year_id?: number;
      status?: 'pending' | 'confirmed' | 'cancelled';
      bursary_type?: string;
      sponsor_id?: number;
      page?: number;
      per_page?: number;
    },
    signal?: AbortSignal,
  ) =>
    api.get<PaginatedResponse<FeeBursary>>(
      "/api/finance/bursaries",
      params ?? {},
      signal,
    ),

  create: (data: CreateBursaryPayload) =>
    api.post<{ id: number }>("/api/finance/bursaries", data),

  bulkCreate: (data: CreateBursaryBulkPayload) =>
    api.post<{ created: number; skipped: number; total_input: number }>(
      "/api/finance/bursaries/bulk",
      data,
    ),

  delete: (id: number) => api.delete<null>(`/api/finance/bursaries/${id}`),
  update: (id: number, data: Partial<CreateBursaryPayload>) =>
    api.put<null>(`/api/finance/bursaries/${id}`, data),

  confirm: (id: number) =>
    api.patch<null>(`/api/finance/bursaries/${id}/confirm`),

  cancel: (id: number) =>
    api.patch<null>(`/api/finance/bursaries/${id}/cancel`),
};

// ─── Dashboard & Reports ──────────────────────────────────────────────────────

export const financeReportService = {
  getSummary: (academicYearId: number, signal?: AbortSignal) =>
    api.get<FinanceSummary>(
      "/api/finance/summary",
      { academic_year_id: academicYearId },
      signal,
    ),

  getRevenueByType: (academicYearId: number, signal?: AbortSignal) =>
    api.get<RevenueByType[]>(
      "/api/finance/reports/revenue",
      { academic_year_id: academicYearId },
      signal,
    ),

  getOutstanding: (limit?: number, signal?: AbortSignal) =>
    api.get<FeeInvoice[]>(
      "/api/finance/reports/outstanding",
      limit ? { limit } : {},
      signal,
    ),

  getProjection: (academicYearId: number, signal?: AbortSignal) =>
    api.get<IncomeProjection>(
      "/api/finance/reports/projection",
      { academic_year_id: academicYearId },
      signal,
    ),

  getMonthlyCollections: (academicYearId: number, signal?: AbortSignal) =>
    api.get<MonthlyCollection[]>(
      "/api/finance/reports/monthly",
      { academic_year_id: academicYearId },
      signal,
    ),
};

// ─── Account Balance ──────────────────────────────────────────────────────────

export const balanceService = {
  get: (academicYearId: number, signal?: AbortSignal) =>
    api.get<AccountBalance>(
      "/api/finance/balance",
      { academic_year_id: academicYearId },
      signal,
    ),
};

// ─── Billing Summary & Bulk Invoice ───────────────────────────────────────────

export const billingService = {
  getSummary: (params: {
    academic_year_id: number;
    semester?: number;
    faculty_id?: number;
    department_id?: number;
    keyword?: string;
    balance_filter?: 'collected' | 'bursary' | 'pending' | 'partial' | 'overdue';
    page?: number;
    per_page?: number;
  }) => api.get<BillingSummary[]>("/api/finance/billing/summary", params as Record<string, unknown>),

  bulkGenerate: (data: {
    academic_year_id: number;
    semester?: number;
    student_ids?: string[];
    faculty_id?: number;
    department_id?: number;
  }) =>
    // No timeout — bulk generation can process hundreds of students and routinely
    // exceeds the global 15 s API_TIMEOUT.
    apiClient.post<{ data: { processed_students: number; total_created: number; total_skipped: number; total_updated?: number } }>(
      "/api/finance/billing/bulk-generate", data, { timeout: 0 }
    ).then((r) => r.data),
};

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const expenseService = {
  list: (
    params?: {
      academic_year_id?: number;
      category_id?: number;
      from_date?: string;
      to_date?: string;
      page?: number;
      per_page?: number;
    },
    signal?: AbortSignal,
  ) =>
    api.get<PaginatedResponse<Expense>>(
      "/api/finance/expenses",
      params ?? {},
      signal,
    ),

  listCategories: (signal?: AbortSignal) =>
    api.get<ExpenseCategory[]>("/api/finance/expenses/categories", {}, signal),

  createCategory: (data: { name: string; description?: string }) =>
    api.post<{ id: number }>("/api/finance/expenses/categories", data),

  updateCategory: (id: number, data: { name?: string; description?: string }) =>
    api.put<null>(`/api/finance/expenses/categories/${id}`, data),

  deleteCategory: (id: number) =>
    api.delete<null>(`/api/finance/expenses/categories/${id}`),

  create: (data: CreateExpensePayload) =>
    api.post<{ id: number }>("/api/finance/expenses", data),

  update: (id: number, data: Partial<CreateExpensePayload>) =>
    api.put<null>(`/api/finance/expenses/${id}`, data),

  delete: (id: number) => api.delete<null>(`/api/finance/expenses/${id}`),
};

// ─── Expense Budgets ──────────────────────────────────────────────────────────

export const budgetService = {
  list: (academicYearId: number, signal?: AbortSignal) =>
    api.get<ExpenseBudget[]>(
      "/api/finance/budgets",
      { academic_year_id: academicYearId },
      signal,
    ),

  save: (data: SaveBudgetPayload) =>
    api.post<null>("/api/finance/budgets", data),
};

// ─── Clearance ────────────────────────────────────────────────────────────────

export const clearanceService = {
  getStatus: (
    studentId: string,
    academicYearId: number,
    semester?: number | null,
    signal?: AbortSignal,
  ) =>
    api.get<ClearanceResult>(
      "/api/finance/clearance",
      {
        student_id: studentId,
        academic_year_id: academicYearId,
        ...(semester != null ? { semester } : {}),
      },
      signal,
    ),

  grant: (data: {
    student_id: string;
    academic_year_id: number;
    semester?: number | null;
    notes?: string;
  }) => api.post<StudentClearance>("/api/finance/clearance", data),

  getBulk: (
    academicYearId: number,
    params?: { page?: number; per_page?: number },
    signal?: AbortSignal,
  ) =>
    api.get<PaginatedResponse<StudentClearance>>(
      "/api/finance/clearance/bulk",
      {
        academic_year_id: academicYearId,
        ...params,
      },
      signal,
    ),

  runBulk: (academicYearId: number) =>
    api.post<{ total: number; cleared: number; not_cleared: number }>(
      "/api/finance/clearance/bulk",
      { academic_year_id: academicYearId },
    ),

  getExamEligibility: (
    studentId: string,
    academicYearId: number,
    semester: 1 | 2,
    signal?: AbortSignal,
  ) =>
    api.get<import("@/types/finance").ExamEligibility>(
      "/api/finance/clearance/exam-eligibility",
      { student_id: studentId, academic_year_id: academicYearId, semester },
      signal,
    ),

  getReport: (
    academicYearId: number,
    feeStructureId: number,
    period: string,
    signal?: AbortSignal,
  ) =>
    api.get<ClearanceReport>(
      "/api/finance/clearance/report",
      { academic_year_id: academicYearId, fee_structure_id: feeStructureId, period },
      signal,
    ),
};

// ─── Sponsors ─────────────────────────────────────────────────────────────────

export const sponsorService = {
  list: (params?: { is_active?: boolean; academic_year_id?: number }, signal?: AbortSignal) =>
    api.get<Sponsor[]>(
      "/api/finance/sponsors",
      { 
        ...(params?.is_active ? { is_active: 1 } : {}),
        ...(params?.academic_year_id ? { academic_year_id: params.academic_year_id } : {}),
      },
      signal,
    ),

  create: (data: CreateSponsorPayload) =>
    api.post<{ id: number }>("/api/finance/sponsors", data),

  update: (id: number, data: Partial<CreateSponsorPayload>) =>
    api.put<null>(`/api/finance/sponsors/${id}`, data),
};

// ─── Student Fee Overrides ────────────────────────────────────────────────────

export const overrideService = {
  list: (studentId: string, academicYearId: number, signal?: AbortSignal) =>
    api.get<StudentFeeOverride[]>(
      "/api/finance/overrides",
      { student_id: studentId, academic_year_id: academicYearId },
      signal,
    ),

  create: (data: CreateOverridePayload) =>
    api.post<null>("/api/finance/overrides", data),

  delete: (id: number) => api.delete<null>(`/api/finance/overrides/${id}`),
};

// ─── Refunds ──────────────────────────────────────────────────────────────────

export const refundService = {
  list: (
    params?: {
      student_id?: string;
      status?: RefundStatus;
      category?: RefundCategory;
      page?: number;
      per_page?: number;
    },
    signal?: AbortSignal,
  ) =>
    api.get<PaginatedResponse<FeeRefund>>(
      "/api/finance/refunds",
      params ?? {},
      signal,
    ),

  create: (data: CreateRefundPayload) =>
    api.post<{ id: number }>("/api/finance/refunds", data),

  process: (id: number, academicYearId: number, notes?: string) =>
    api.patch<null>(`/api/finance/refunds/${id}/process`, {
      academic_year_id: academicYearId,
      ...(notes ? { notes } : {}),
    }),

  reject: (id: number, notes?: string) =>
    api.patch<null>(`/api/finance/refunds/${id}/reject`, notes ? { notes } : {}),
};

// ─── Student Self-Service Finance ────────────────────────────────────────────

export const myLedgerService = {
  getMyLedger: (
    params?: { academic_year_id?: number; semester?: 1 | 2 },
    signal?: AbortSignal,
  ) =>
    api.get<StudentLedger>("/api/finance/my/invoices", params ?? {}, signal),

  getMyClearance: (
    academicYearId: number,
    semester?: 1 | 2 | null,
    signal?: AbortSignal,
  ) =>
    api.get<ClearanceResult>(
      "/api/finance/my/clearance",
      {
        academic_year_id: academicYearId,
        ...(semester != null ? { semester } : {}),
      },
      signal,
    ),

  getPaymentLink: (signal?: AbortSignal) =>
    api.get<{ checkout_url: string; amount_due: number; currency: string }>(
      "/api/payment/checkout-link",
      {},
      signal,
    ),

  getMobileHistory: (signal?: AbortSignal) =>
    api.get<MobilePaymentRecord[]>("/api/payment/history", {}, signal),
};

// ─── CSV Export ───────────────────────────────────────────────────────────────

export const exportService = {
  downloadCSV: (
    type: "revenue" | "payments" | "outstanding" | "expenses",
    academicYearId?: number,
  ): void => {
    const token = localStorage.getItem("auth_token") ?? "";
    const base = import.meta.env.VITE_API_BASE_URL ?? "";
    const year = academicYearId ? `&academic_year_id=${academicYearId}` : "";
    const url = `${base}/api/finance/reports/export?type=${type}${year}&token=${token}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },
};
