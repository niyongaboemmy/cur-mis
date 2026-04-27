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

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'overdue' | 'waived'

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'BURSARY' | 'WAIVER'

export type PaymentStatus = 'pending' | 'confirmed' | 'rejected'

// ─── Fee Structures ───────────────────────────────────────────────────────────

export interface FeeStructure {
  id:                   number
  academic_year_id:     number
  academic_year_label?: string
  department_id:        number | null
  department_name?:     string | null
  level_id:             number | null
  level_name?:          string | null
  fee_type:             Exclude<FeeType, 'ARREARS' | 'BURSARY_CREDIT'>
  label:                string
  amount:               number
  semester:             1 | 2 | null
  is_active:            0 | 1
  created_by:           number
  created_at:           string
  updated_at:           string
}

export interface CreateFeeStructurePayload {
  academic_year_id: number
  department_id?:   number | null
  level_id?:        number | null
  fee_type:         string
  label:            string
  amount:           number
  semester?:        1 | 2 | null
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
  student_id:        string
  academic_year_id:  number
  semester?:         1 | 2 | null
  fee_type:          FeeType
  description:       string
  amount_due:        number
  due_date?:         string | null
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
  notes:               string | null
  created_at:          string
}

export interface CreateBursaryPayload {
  student_id:        string
  academic_year_id:  number
  bursary_type:      string
  amount:            number
  coverage_pct?:     number | null
  notes?:            string
  status?:           BursaryStatus
}

// ─── Student Ledger ───────────────────────────────────────────────────────────

export interface LedgerTotals {
  total_due:     number | null
  total_paid:    number | null
  total_bursary: number | null
  balance:       number | null
  unpaid_count:  number
}

export interface StudentLedger {
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
}

export interface FinanceSummary {
  totals:          FinanceSummaryTotals
  recent_payments: RecentPayment[]
  overdue_count:   number
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
}

// ─── Revenue Report ───────────────────────────────────────────────────────────

export interface RevenueByType {
  fee_type:        FeeType
  invoice_count:   number
  total_expected:  number
  total_collected: number
  total_bursary:   number
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
  amount:           number
  notes?:           string
}

export interface SaveBudgetPayload {
  academic_year_id: number
  category_id:      number
  amount:           number
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
