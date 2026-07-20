/** Types for the Fee Management module. */

export type FeeType =
  | 'TUITION'
  | 'REGISTRATION'
  | 'ADMISSION'
  | 'HOSTEL'
  | 'ACADEMIC_DOCUMENT'
  | 'FINE'
  | 'REPEAT_MODULE'
  | 'ARREARS'
  | 'BURSARY_CREDIT'
  | 'MODULE_FEE'

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'overdue' | 'waived'

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'BURSARY' | 'WAIVER'

export type PaymentStatus = 'pending' | 'confirmed' | 'rejected'

// ─── Fee Structures ───────────────────────────────────────────────────────────

export type PaymentPlan = 'full_year' | 'per_semester' | 'per_installment'

export interface FeeStructure {
  id:                   number
  academic_year_id:     number
  academic_year_label?: string
  department_id:        number | null
  department_name?:     string | null
  /** comma-separated department IDs from fee_structure_departments join */
  dept_ids?:            string | null
  level_id:             number | null
  level_name?:          string | null
  campus_id:            number | null
  campus_name?:         string | null
  /** comma-separated option IDs from fee_structure_options join */
  option_ids?:          string | null
  student_category?:    StudentCategory | null
  fee_type:             Exclude<FeeType, 'ARREARS' | 'BURSARY_CREDIT'>
  label:                string
  amount:               number
  currency?:            string
  semester:             1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null
  payment_plan?:        PaymentPlan
  installment_count?:   number | null
  is_active:            0 | 1
  created_by:           number
  created_at:           string
  updated_at:           string
}

export type StudentCategory = 'local' | 'international' | 'sponsored' | 'self_sponsored'

export interface CreateFeeStructurePayload {
  academic_year_id:   number
  department_id?:     number | null
  department_ids?:    number[]
  level_id?:          number | null
  campus_id?:         number | null
  option_ids?:        number[]
  student_category?:  StudentCategory | null
  fee_type:           string
  label:              string
  amount:             number
  currency?:          string
  semester?:          1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null
  payment_plan?:      PaymentPlan
  installment_count?: number | null
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export interface FeeInvoice {
  id:                  number
  invoice_number:      string
  student_id:          string
  fee_structure_id:    number | null
  academic_year_id:    number
  academic_year_label?: string
  semester:            1 | 2 | null
  fee_type:            FeeType
  description:         string
  amount_due:          number
  amount_paid:         number
  bursary_applied:     number
  due_date:            string | null
  status:              InvoiceStatus
  is_system_generated: 0 | 1
  module_id:           number | null
  created_by:          number
  created_at:          string
  updated_at:          string
  /** computed: amount_due - amount_paid - bursary_applied */
  balance?:            number
}

export interface CreateInvoicePayload {
  student_id:         string
  academic_year_id:   number
  fee_structure_id?:  number | null
  semester?:          1 | 2 | null
  fee_type:           FeeType
  description:        string
  amount_due:         number
  due_date?:          string | null
}

export interface GenerateInvoicesPayload {
  academic_year_id: number
  semester?:        1 | 2 | null
}

export interface GenerateInvoicesResult {
  created:  number
  skipped:  number
  invoices: number[]
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export interface FeePayment {
  id:                   number
  invoice_id:           number
  invoice_number?:      string
  invoice_description?: string
  student_id:           string
  student_fname?:       string
  student_lname?:       string
  amount:               number
  payment_method:       PaymentMethod
  reference_number:     string | null
  bank_slip_file_id:    string | null
  receipt_number:       string
  status:               PaymentStatus
  notes:                string | null
  recorded_by:          number
  recorded_by_name?:    string
  paid_at:              string
  confirmed_by:         number | null
  confirmed_at:         string | null
  rejection_reason:     string | null
  created_at:           string
  fee_type?:            FeeType
  academic_year_id?:    number
}

export interface RecordPaymentPayload {
  invoice_id:         number
  amount:             number
  payment_method:     PaymentMethod
  payment_sub_method?: string
  reference_number?:  string
  bank_slip_file_id?: string
  notes?:             string
  paid_at?:           string
}

export interface RecordPaymentResult {
  payment_id:     number
  receipt_number: string
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export interface ReceiptData extends FeePayment {
  invoice_description: string
  fee_type:            FeeType
  academic_year_label: string
  fname:               string
  lname:               string
  regnumber:           string
  faculty_name:        string | null
  department_name:     string | null
  option_name:         string | null
  level_name:          string | null
}

// ─── Bursaries ────────────────────────────────────────────────────────────────

export type BursaryStatus = 'pending' | 'confirmed' | 'cancelled'

export interface FeeBursary {
  id:                  number
  student_id:          string
  student_fname?:      string
  student_lname?:      string
  academic_year_id:    number
  academic_year_label?: string
  bursary_type:        string
  amount:              number
  coverage_pct:        number | null
  status:              BursaryStatus
  approved_by:         number
  approved_by_name?:   string
  confirmed_by?:       number | null
  confirmed_by_name?:  string
  confirmed_at?:       string | null
  sponsor_id?:         number | null
  sponsor_name?:       string | null
  notes:               string | null
  created_at:          string
}

export interface CreateBursaryPayload {
  student_id:        string
  academic_year_id:  number
  bursary_type:      string
  amount:            number
  coverage_pct?:     number | null
  sponsor_id?:       number | null
  notes?:            string
  status?:           BursaryStatus
}

// ─── Student Ledger ───────────────────────────────────────────────────────────

export interface LedgerTotals {
  total_due:          number | null
  total_paid:         number | null
  total_bursary:      number | null
  balance:            number | null
  unpaid_count:       number
  total_paid_gateway?: number | null
  total_paid_manual?:  number | null
}

export interface StudentLedger {
  student?:  any
  invoices: FeeInvoice[]
  payments: FeePayment[]
  totals:   LedgerTotals
}

// ─── Dashboard / Summary ──────────────────────────────────────────────────────

export interface FinanceSummaryTotals {
  total_expected:  number | null
  total_collected: number | null
  paid_count:      number
  unpaid_count:    number
  overdue_count:   number
  partial_count:   number
}

export interface RecentPayment {
  receipt_number: string
  amount:         number
  payment_method: PaymentMethod
  paid_at:        string
  fname:          string
  lname:          string
  fee_type:       FeeType
  source?:        'MANUAL' | 'GATEWAY' | 'APPLICATION_TRANSFER'
}

export interface FinanceSummary {
  totals:              FinanceSummaryTotals
  recent_payments:     RecentPayment[]
  overdue_count:       number
  app_transfer_total:  number
  app_transfer_count:  number
}

// ─── Billing Summary ──────────────────────────────────────────────────────────

export interface BillingSummary {
  regnumber:       string
  fname:           string
  lname:           string
  faculty:         string
  department:      string
  total_expected:  number
  total_collected: number
  total_bursary:   number
  balance:         number
  structure_tuition: number | null
}


// ─── Revenue Report ───────────────────────────────────────────────────────────

export interface RevenueByType {
  fee_type:             FeeType
  invoice_count:        number
  total_expected:       number
  total_collected:      number
  total_bursary:        number
  app_transfer_amount:  number
  app_transfer_count:   number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const FEE_TYPE_LABELS: Record<FeeType, string> = {
  TUITION:           'Tuition',
  REGISTRATION:      'Registration',
  ADMISSION:         'Admission',
  HOSTEL:            'Hostel',
  ACADEMIC_DOCUMENT: 'Academic Document',
  FINE:              'Fine',
  REPEAT_MODULE:     'Repeat Module',
  ARREARS:           'Arrears',
  BURSARY_CREDIT:    'Bursary Credit',
  MODULE_FEE:        'Module Fee',
}

// ─── Fee Types (dynamic lookup table) ────────────────────────────────────────

export interface FeeTypeRecord {
  id:              number
  code:            string
  label:           string
  description:     string | null
  is_active:       0 | 1
  sort_order:      number
  structure_count: number
  invoice_count:   number
  created_at:      string
  updated_at:      string
}

export interface CreateFeeTypePayload {
  code:         string
  label:        string
  description?: string
  is_active?:   0 | 1
  sort_order?:  number
}

export interface UpdateFeeTypePayload {
  label:        string
  description?: string | null
  is_active?:   0 | 1
  sort_order?:  number
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH:           'Cash',
  BANK_TRANSFER:  'Bank Transfer',
  MOBILE_MONEY:   'Mobile Money (MoMo)',
  BURSARY:        'Bursary',
  WAIVER:         'Waiver',
}

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  unpaid:  'text-red-600 bg-red-50',
  partial: 'text-yellow-700 bg-yellow-50',
  paid:    'text-green-700 bg-green-50',
  overdue: 'text-red-800 bg-red-100',
  waived:  'text-gray-500 bg-gray-100',
}

// ─── Payment Sub-Methods ──────────────────────────────────────────────────────

export type BankSubMethod   = 'BK' | 'EQUITY' | 'COGEBANQUE' | 'IM_BANK' | 'GT_BANK' | 'KCB'
export type MomoSubMethod   = 'MTN_MOMO' | 'AIRTEL_MONEY'
export type PaymentSubMethod = BankSubMethod | MomoSubMethod

export const BANK_SUB_METHOD_LABELS: Record<BankSubMethod, string> = {
  BK:          'Bank of Kigali (BK)',
  EQUITY:      'Equity Bank',
  COGEBANQUE:  'Cogebanque',
  IM_BANK:     'I&M Bank',
  GT_BANK:     'GT Bank',
  KCB:         'KCB Bank',
}

export const MOMO_SUB_METHOD_LABELS: Record<MomoSubMethod, string> = {
  MTN_MOMO:    'MTN Mobile Money',
  AIRTEL_MONEY:'Airtel Money',
}

// Extend RecordPaymentPayload with optional sub-method
declare module './finance' {}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export interface ExpenseCategory {
  id:            number
  name:          string
  description:   string | null
  expense_count: number
}

export interface Expense {
  id:                   number
  category_id:          number
  category_name?:       string
  academic_year_id:     number | null
  academic_year_label?: string
  title:                string
  description:          string | null
  amount:               number
  payment_date:         string
  payment_method:       string
  reference_number:     string | null
  vendor:               string | null
  recorded_by:          number
  recorded_by_name?:    string
  created_at:           string
}

export interface CreateExpensePayload {
  category_id:       number
  academic_year_id?: number
  title:             string
  description?:      string
  amount:            number
  payment_date:      string
  payment_method?:   string
  reference_number?: string
  vendor?:           string
}

export interface ExpenseBudget {
  id:               number
  academic_year_id: number
  category_id:      number
  category_name?:   string
  department_id?:   number | null
  department_name?: string | null
  amount:           number
  spent?:           number
  notes?:           string
}

export interface SaveBudgetPayload {
  academic_year_id: number
  category_id:      number
  amount:           number
  department_id?:   number | null
}

// ─── Budget Execution (Phase 4) ────────────────────────────────────────────────

export interface BudgetExecutionRow {
  category_id:      number
  category_name:    string
  department_id:    number | null
  department_name:  string | null
  planned_budget:   number
  amount_spent:     number
  balance:          number
  variance:         number
  is_overspend:     boolean
}

export interface BudgetExecutionYearResult {
  academic_year_id: number
  label:            string
  rows:             BudgetExecutionRow[]
}

export interface BudgetExecutionCompareResult {
  year_a: BudgetExecutionYearResult
  year_b: BudgetExecutionYearResult
}

// ─── Financial Budget Plan (migration 106/107) ─────────────────────────────────

export interface BudgetPlanLineItem {
  id:               number
  parent_id:        number | null
  section:          string
  label:            string
  row_type:         'data' | 'subtotal' | 'header'
  sort_order:       number
  general_total:    number | null
  months:           Record<string, number>
  executed_total:   number | null
  variance:         number | null
  pct_realisation:  number | null
}

export interface BudgetPlanStudentProjection {
  faculty_label:    string
  department_label: string | null
  level_label:      string
  program_type:     'day' | 'weekend' | 'holiday'
  intake_period:    string
  headcount:        number
  sort_order:       number
}

export interface BudgetPlanStudentExecution {
  faculty_code: string
  budgeted:     number
  executed:     number
  rank:         number | null
  sort_order:   number
}

export interface BudgetPlanReferenceRate {
  rate_group: string
  label:      string
  value1:     number | null
  value2:     number | null
  value3:     number | null
  sort_order: number
}

export interface BudgetPlan {
  id:                     number
  academic_year_id:       number
  academic_year_label:    string
  title:                  string
  student_count_budgeted: number | null
  line_items:             BudgetPlanLineItem[]
  student_projections:    BudgetPlanStudentProjection[]
  student_executions:     BudgetPlanStudentExecution[]
  reference_rates:        BudgetPlanReferenceRate[]
  month_names:            Record<string, string>
}

export const BUDGET_PLAN_SECTIONS = [
  'revenue', 'staff_cost', 'admin_cost', 'academic_cost', 'ict_cost',
  'finance_cost', 'capex', 'financing', 'arrears', 'cashflow',
] as const

export const BUDGET_PLAN_ROW_TYPES = ['data', 'subtotal', 'header'] as const

export interface CreateBudgetPlanPayload {
  academic_year_id:       number
  title?:                 string
  student_count_budgeted?: number | null
}

export interface UpdateBudgetPlanPayload {
  title?:                  string
  student_count_budgeted?: number | null
}

export interface SaveBudgetLineItemPayload {
  section?:        string
  label?:          string
  row_type?:       string
  general_total?:  number | null
  executed_total?: number | null
  months?:         Record<number, number | null>
}

// ─── Account Balance ──────────────────────────────────────────────────────────

export interface AccountBalance {
  expected_revenue:  number
  collected_revenue: number
  bursary_revenue:   number
  total_expenses:    number
  net_balance:       number
  total_budget:      number
  budgets:           ExpenseBudget[]
  collection_rate?:  number
  expense_by_category?: any[]
}

// ─── Clearance ────────────────────────────────────────────────────────────────

export type ClearanceStatus = 'cleared' | 'not_cleared' | 'conditional'

export interface StudentClearance {
  id?:                   number
  student_id:            string
  academic_year_id:      number
  academic_year_label?:  string
  semester:              number | null
  status:                ClearanceStatus
  balance_at_clearance?: number
  notes:                 string | null
  cleared_by?:           number
  cleared_by_name?:      string
  cleared_at?:           string
  auto_cleared:          0 | 1
  fname?:                string
  lname?:                string
  regnumber?:            string
  department_name?:      string
}

export interface ClearanceResult {
  status:    ClearanceStatus
  balance:   number
  threshold: number
  record:    StudentClearance | null
  totals?:   Record<string, number>
}

// ─── Exam Eligibility ─────────────────────────────────────────────────────────

export interface ExamInstallment {
  label:      string
  amount:     number
  cumulative: number
  for_exam_s: 1 | 2
  covered:    boolean
}

export interface ExamEligibilityItem {
  fee_type:          string
  label:             string
  payment_plan:      PaymentPlan
  installment_count: number
  total_billed:      number
  min_required:      number
  total_covered:     number
  shortfall:         number
  eligible:          boolean
  schedule:          ExamInstallment[]
}

export interface ExamEligibility {
  semester:        1 | 2
  eligible:        boolean
  total_required:  number
  total_covered:   number
  total_shortfall: number
  items:           ExamEligibilityItem[]
}

export const CLEARANCE_STATUS_LABELS: Record<ClearanceStatus, string> = {
  cleared:     'Cleared',
  not_cleared: 'Not Cleared',
  conditional: 'Conditional',
}

export const CLEARANCE_STATUS_COLORS: Record<ClearanceStatus, string> = {
  cleared:     'text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-400',
  not_cleared: 'text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400',
  conditional: 'text-orange-700 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400',
}

// ─── Clearance Report ─────────────────────────────────────────────────────────

export type ClearanceReportStudentStatus = 'cleared' | 'partial' | 'not_paid'

export interface ClearanceReportStudent {
  student_id:           string
  regnumber:            string
  fname:                string
  lname:                string
  department_name:      string | null
  amount_billed:        number
  amount_paid:          number
  bursary_applied:      number
  total_covered:        number
  required_this_period: number
  shortfall:            number
  status:               ClearanceReportStudentStatus
}

export interface ClearanceReport {
  fee_structure:   FeeStructure
  period:          string
  period_label:    string
  required_amount: number
  summary: {
    total:           number
    cleared:         number
    partial:         number
    not_paid:        number
    total_billed:    number
    total_collected: number
  }
  students: ClearanceReportStudent[]
}

// ─── Income Projection ────────────────────────────────────────────────────────

export interface IncomeProjectionStructure {
  fee_type:        FeeType
  label:           string
  amount:          number
  department_name: string | null
  level_name:      string | null
  semester:        number | null
}

export interface IncomeProjection {
  structures:        IncomeProjectionStructure[]
  enrolled_students: number
}

// ─── Monthly Collections Trend ────────────────────────────────────────────────

export interface MonthlyCollection {
  month:       string   // e.g. "Jan"
  month_num:   number
  collected:   number
  count:       number
  tuition:     number
  hostel:      number
  other_fees:  number
  expenses:    number
}

// ─── Sponsors ─────────────────────────────────────────────────────────────────

export interface Sponsor {
  id:         number
  name:       string
  email:      string | null
  phone:      string | null
  is_active:  0 | 1
  created_at: string
  updated_at: string
}

export interface CreateSponsorPayload {
  name:       string
  email?:     string | null
  phone?:     string | null
  is_active?: 0 | 1
}

// ─── Student Fee Overrides ────────────────────────────────────────────────────

export type OverrideFeeType = Exclude<FeeType, 'ARREARS' | 'BURSARY_CREDIT' | 'MODULE_FEE'>

export interface StudentFeeOverride {
  id:                number
  student_id:        string
  academic_year_id:  number
  fee_type:          OverrideFeeType
  amount:            number
  reason:            string
  created_by:        number
  created_by_name?:  string
  created_at:        string
}

export interface CreateOverridePayload {
  student_id:       string
  academic_year_id: number
  fee_type:         OverrideFeeType
  amount:           number
  reason?:          string
}

// ─── Refunds ──────────────────────────────────────────────────────────────────

export type RefundCategory = 'REFUND' | 'CAUTION' | 'OVERPAYMENT'
export type RefundStatus   = 'pending' | 'processed' | 'rejected'

export interface FeeRefund {
  id:                  number
  student_id:          string
  student_fname?:      string
  student_lname?:      string
  amount:              number
  category:            RefundCategory
  reason:              string
  status:              RefundStatus
  processed_by:        number | null
  processed_by_name?:  string | null
  notes:               string | null
  created_at:          string
  updated_at:          string
}

export interface CreateRefundPayload {
  student_id:  string
  payment_id:  number
  amount:      number
  category:    RefundCategory
  reason:      string
  notes?:      string
}

export const REFUND_CATEGORY_LABELS: Record<RefundCategory, string> = {
  REFUND:      'Refund',
  CAUTION:     'Caution Money',
  OVERPAYMENT: 'Overpayment',
}

export const REFUND_STATUS_COLORS: Record<RefundStatus, string> = {
  pending:   'text-yellow-700 bg-yellow-50',
  processed: 'text-green-700 bg-green-50',
  rejected:  'text-red-600 bg-red-50',
}

// ─── Bulk Bursary Upload ──────────────────────────────────────────────────────

export interface CreateBursaryBulkPayload {
  academic_year_id:   number
  bursary_type:       string
  amount_per_student: number
  sponsor_id?:        number | null
  student_ids?:       string[]
  student_ids_text?:  string
}

// ─── UrubutoPay Mobile Payments ───────────────────────────────────────────────

export interface MobilePaymentRecord {
  id:                 number
  transaction_code:   string
  amount:             number
  payment_sub_method: string | null
  receipt_number:     string | null
  notes:              string | null
  payment_date:       string
  status:             'confirmed'
  created_at:         string
  invoice_number:     string | null
  fee_type:           string | null
}

// ─── Payment Calendar ─────────────────────────────────────────────────────────
// Redesigned (Jul 2026) to model the official "PROPOSED PAYMENT CALENDAR"
// workbook: one printable document per faculty/intake with dated, amounted
// installment rows grouped under level/semester headings, plus notes and
// Prepared/Verified/Approved signatures.

export type PaymentCalendarEventType =
  | 'registration_deadline'
  | 'installment_due'
  | 'penalty_start'
  | 'semester_start'
  | 'semester_end'

export const PAYMENT_CALENDAR_EVENT_TYPES: PaymentCalendarEventType[] = [
  'registration_deadline',
  'installment_due',
  'penalty_start',
  'semester_start',
  'semester_end',
]

export const PAYMENT_CALENDAR_EVENT_TYPE_LABELS: Record<PaymentCalendarEventType, string> = {
  registration_deadline: 'Registration Deadline',
  installment_due:       'Installment Due',
  penalty_start:         'Penalty Start',
  semester_start:        'Semester Start',
  semester_end:          'Semester End',
}

export interface PaymentCalendarItem {
  id:             number
  document_id:    number
  group_label:    string | null
  item_label:     string
  event_type:     PaymentCalendarEventType
  start_date:     string | null
  deadline_date:  string
  amount:         string | number | null
  is_active:      0 | 1
  sort_order:     number
}

export interface PaymentCalendarDocument {
  id:                   number
  academic_year_id:     number
  academic_year_label:  string | null
  faculty_id:           number | null
  faculty_name:         string | null
  title:                string
  intake_label:         string | null
  department_label:     string | null
  level_label:          string | null
  notes:                string | null
  bank_account_note:    string | null
  cursu_account_note:   string | null
  payment_method_note:  string | null
  fine_notice:          string | null
  prepared_by_name:     string | null
  prepared_by_title:    string | null
  verified_by_name:     string | null
  verified_by_title:    string | null
  approved_by_name:     string | null
  approved_by_title:    string | null
  is_active:            0 | 1
  created_by:           number | null
  created_at:           string
  updated_at:           string
  items:                PaymentCalendarItem[]
}

export interface PaymentCalendarItemPayload {
  group_label?:    string | null
  item_label:      string
  event_type?:     PaymentCalendarEventType
  start_date?:     string | null
  deadline_date:   string
  amount?:         number | null
  is_active?:      0 | 1
  sort_order?:     number
}

export interface CreatePaymentCalendarDocumentPayload {
  academic_year_id:     number
  faculty_id?:          number | null
  title?:               string
  intake_label?:        string | null
  department_label?:    string | null
  level_label?:         string | null
  notes?:                string | null
  bank_account_note?:    string | null
  cursu_account_note?:   string | null
  payment_method_note?:  string | null
  fine_notice?:          string | null
  prepared_by_name?:     string | null
  prepared_by_title?:    string | null
  verified_by_name?:     string | null
  verified_by_title?:    string | null
  approved_by_name?:     string | null
  approved_by_title?:    string | null
  is_active?:            0 | 1
  items?:                PaymentCalendarItemPayload[]
}

export type UpdatePaymentCalendarDocumentPayload = Partial<CreatePaymentCalendarDocumentPayload>

// ─── Postgraduate Fees — International Students (Phase 5) ────────────────────
// Deliberately separate from FeeStructure/CreateFeeStructurePayload — the client
// asked for postgraduate/international fees to stay a distinct table/view, not
// merged into the regular fee schedule.

export type SurchargeType = 'visa' | 'insurance' | 'other' | 'none'

export const SURCHARGE_TYPES: SurchargeType[] = ['visa', 'insurance', 'other', 'none']

export const SURCHARGE_TYPE_LABELS: Record<SurchargeType, string> = {
  visa:      'Visa',
  insurance: 'Insurance',
  other:     'Other',
  none:      'None',
}

export interface PgIntlFeeStructure {
  id:                   number
  academic_year_id:     number
  academic_year_label?: string
  department_id:        number | null
  department_name?:     string | null
  level_id:             number | null
  level_name?:          string | null
  fee_type:             string
  label:                string
  amount:               number
  currency:             string
  semester:             1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null
  payment_plan:         PaymentPlan
  installment_count:    number | null
  nationality_region:   string | null
  surcharge_type:       SurchargeType
  is_active:            0 | 1
  created_by:           number | null
  created_at:           string
  updated_at:           string
}

export interface CreatePgIntlFeeStructurePayload {
  academic_year_id:    number
  department_id?:      number | null
  level_id?:           number | null
  fee_type:            string
  label:               string
  amount:              number
  currency?:           string
  semester?:           1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null
  payment_plan?:       PaymentPlan
  installment_count?:  number | null
  nationality_region?: string | null
  surcharge_type?:     SurchargeType
}

export interface UpdatePgIntlFeeStructurePayload {
  department_id?:      number | null
  level_id?:           number | null
  label?:              string
  amount?:             number
  currency?:           string
  semester?:           1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null
  payment_plan?:       PaymentPlan
  installment_count?:  number | null
  nationality_region?: string | null
  surcharge_type?:     SurchargeType
  is_active?:          0 | 1
}

// ─── Student Directory (Finance view, Phase 2) ────────────────────────────────

export type FinanceStudentFeeStatus = 'no_invoices' | 'paid' | 'partial' | 'unpaid'

export interface FinanceStudentFeeSummary {
  total_due:     number
  total_paid:    number
  total_bursary: number
  balance:       number
  status:        FinanceStudentFeeStatus | string
  has_override:  boolean
}

export interface FinanceStudentDirectoryRow {
  id:           number
  regnumber?:   string | null
  fname:        string
  lname:        string
  email?:       string | null
  gender?:      string | null
  nationality?: string | null
  fee_status:   FinanceStudentFeeSummary
}

