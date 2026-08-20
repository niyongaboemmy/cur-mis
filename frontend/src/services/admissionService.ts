import { api } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { withCampusScope } from '@/store/campusFilterStore'
import type { PaginatedResponse } from '@/types'
import type {
  Faculty, PortalDepartment, DocumentType, AdmissionRequirement,
  StudentApplication, ApplicationDocument, ApplicationStatusLog,
  ApplicationStatus, MeritCriteria, MeritListRow, AdmissionOffer,
  ApplicantProfile, AcademicRecord, ApplicationPendingNote,
} from '@/types/admission'
import type { AcademicYear } from '@/types/academic'

/* ───────────────────────────────────────────────────────────────
 * Public portal — no auth required (used by prospective students)
 * ─────────────────────────────────────────────────────────────── */
export const portalService = {
  getActiveYear: (signal?: AbortSignal) =>
    api.get<AcademicYear>('/api/portal/active-year', {}, signal),

  getIntakes: (signal?: AbortSignal) =>
    api.get<{ id: number; name: string }[]>('/api/portal/intakes', {}, signal),

  getFaculties: (signal?: AbortSignal) =>
    api.get<Faculty[]>('/api/portal/faculties', {}, signal),

  getFacultyDepartments: (facultyId: number, signal?: AbortSignal) =>
    api.get<PortalDepartment[]>(`/api/portal/faculties/${facultyId}/departments`, {}, signal),

  getPrograms: (params: { campus_id?: number } = {}, signal?: AbortSignal) =>
    api.get<Array<{
      id:               number
      name:             string
      department_id:    number
      department_name:  string | null
      department_code:  string | null
      faculty_id:       number | null
      faculty_name:     string | null
      faculty_code:     string | null
      is_active:        0 | 1 | null
      campuses: Array<{
        id:       number
        name:     string
        code:     string | null
        location: string | null
      }>
    }>>('/api/portal/programs', params, signal),

  getLevels: (signal?: AbortSignal) =>
    api.get<Array<{ id: number; name: string }>>('/api/portal/levels', {}, signal),

  getFacultyRequirements: (facultyId: number, signal?: AbortSignal) =>
    api.get<{ academic_year: { id: number; label: string }; faculty_id: number; requirements: AdmissionRequirement[] }>(`/api/portal/faculties/${facultyId}/requirements`, {}, signal),

  getDocumentTypes: (signal?: AbortSignal) =>
    api.get<DocumentType[]>('/api/portal/document-types', {}, signal),

  /**
   * Pre-flight uniqueness check for the apply wizard's personal step —
   * phone / email / national ID must not already belong to a student.
   */
  checkIdentity: (
    data: { phone?: string; email?: string; national_id?: string },
    signal?: AbortSignal,
  ) =>
    api.post<{
      available: boolean
      fields: Partial<Record<'phone' | 'email' | 'national_id', { taken: boolean; message: string | null }>>
    }>('/api/portal/check-identity', data, signal),

  submitApplication: (data: Record<string, unknown>) =>
    api.post<{ id: number; application_number: string }>('/api/portal/applications', data),

  trackApplication: (appNumber: string, signal?: AbortSignal) =>
    api.get<StudentApplication & { documents: ApplicationDocument[]; status_log?: ApplicationStatusLog[] }>(
      `/api/portal/applications/${appNumber}`, {}, signal,
    ),

  /** Multipart upload — backend proxies to the file-server internally. */
  uploadDocument: (appNumber: string, data: { document_type_id: number; file: File }) => {
    const form = new FormData()
    form.append('document_type_id', String(data.document_type_id))
    form.append('document', data.file)
    return api.upload<{
      id: number
      document_type_id: number
      document_type_name: string
      verification_status: 'pending' | 'verified' | 'rejected'
      document_status: string
    }>(`/api/portal/applications/${appNumber}/documents`, form)
  },

  respondToOffer: (appNumber: string, data: { response: 'accept' | 'decline'; notes?: string }) =>
    api.post<null>(`/api/portal/applications/${appNumber}/respond`, data),
}

/* ───────────────────────────────────────────────────────────────
 * Admin — document types catalogue
 * permission: MANAGE_ADMISSION_REQUIREMENTS
 * ─────────────────────────────────────────────────────────────── */
export const documentTypeService = {
  list:   (signal?: AbortSignal) => api.get<DocumentType[]>('/api/admin/document-types', {}, signal),
  create: (d: Partial<DocumentType>) => api.post<{ id: number }>('/api/admin/document-types', d),
  update: (id: number, d: Partial<DocumentType>) => api.put<null>(`/api/admin/document-types/${id}`, d),
  remove: (id: number) => api.delete<null>(`/api/admin/document-types/${id}`),
}

/* ───────────────────────────────────────────────────────────────
 * Admin — admission requirements (per-faculty document checklist)
 * ─────────────────────────────────────────────────────────────── */
export const admissionRequirementService = {
  list: (params: { faculty_id?: number } = {}, signal?: AbortSignal) =>
    api.get<AdmissionRequirement[]>('/api/admin/admission-requirements', params, signal),

  getForFaculty: (facultyId: number, signal?: AbortSignal) =>
    api.get<{
      faculty:         { id: number; name: string; code: string }
      requirements:    AdmissionRequirement[]
      available_types: DocumentType[]
    }>(`/api/admin/admission-requirements/faculty/${facultyId}`, {}, signal),

  create: (d: Partial<AdmissionRequirement>) =>
    api.post<{ id: number }>('/api/admin/admission-requirements', d),

  update: (id: number, d: Partial<AdmissionRequirement>) =>
    api.put<null>(`/api/admin/admission-requirements/${id}`, d),

  remove: (id: number) => api.delete<null>(`/api/admin/admission-requirements/${id}`),
}

/* ───────────────────────────────────────────────────────────────
 * Admin — application management
 * permission: MANAGE_STUDENT_APPLICATIONS
 * ─────────────────────────────────────────────────────────────── */
export const applicationAdminService = {
  list: (
    params: { page?: number; per_page?: number; status?: ApplicationStatus | 'pending'; department_id?: number; intake?: string; campus_id?: number; mode_of_study?: string; search?: string; q?: string; level_id?: number; gender?: string; payment_status?: string; include_hidden?: '1'; only_hidden?: '1'; sort_paid_first?: '1'; submitted_from?: string; submitted_to?: string } = {},
    signal?: AbortSignal,
  ) => {
    const { q, ...rest } = params;
    // Inject the global topbar campus scope (no-op when caller already
    // set campus_id, so the dashboard's per-tile drill-downs still win).
    const scoped = withCampusScope({ ...rest, search: q ?? rest.search });
    return api.get<PaginatedResponse<StudentApplication>>('/api/admin/applications', scoped, signal);
  },
  
  /** Dashboard aggregates. Takes the same submission window as list() so
   *  the stat tiles and the table under them describe the same rows. */
  getStats: (
    params: { submitted_from?: string; submitted_to?: string } = {},
    signal?: AbortSignal,
  ) =>
    api.get<{ 
      by_status: any[]; 
      by_intake: any[]; 
      by_dept: any[];
      by_gender: any[];
      trend: any[];
      recent: any[]; 
      total: number 
    }>('/api/admin/applications/stats', params, signal),

  show: (id: number, signal?: AbortSignal) =>
    api.get<{ 
      application: StudentApplication; 
      documents?: ApplicationDocument[]; 
      status_log?: ApplicationStatusLog[];
      merit_criteria?: MeritCriteria | null;
      merit_listing?: MeritListRow | null;
    }>(
      `/api/admin/applications/${id}`, {}, signal,
    ),

  updateStatus: (id: number, data: { status: ApplicationStatus; notes?: string }) =>
    api.patch<null>(`/api/admin/applications/${id}/status`, data),

  addNote: (id: number, data: { notes: string }) =>
    api.post<null>(`/api/admin/applications/${id}/notes`, data),

  listPendingNotes: (id: number, signal?: AbortSignal) =>
    api.get<{ notes: ApplicationPendingNote[]; count: number }>(
      `/api/admin/applications/${id}/pending-notes`,
      {},
      signal,
    ),

  addPendingNote: (id: number, data: { note: string }) =>
    api.post<{ notes: ApplicationPendingNote[]; count: number }>(
      `/api/admin/applications/${id}/pending-notes`,
      data,
    ),

  /**
   * Pre-enrollment check: does this applicant already have a student record?
   * Returns the prior records so the admin can confirm before creating a
   * postgraduate row alongside.
   */
  hide:    (id: number, data: { reason?: string } = {}) =>
    api.patch<{ is_hidden: 1 }>(`/api/admin/applications/${id}/hide`, data),
  restore: (id: number) =>
    api.patch<{ is_hidden: 0 }>(`/api/admin/applications/${id}/restore`),

  /** Task 1.11 — credit-transfer exemption-letter workflow. */
  setExemptionStatus: (id: number, data: {
    action: 'received_registry' | 'received_finance' | 'confirmed' | 'pending'
    entry_level_override?: string
  }) =>
    api.patch<{ exemption_letter_status: string }>(`/api/admin/applications/${id}/exemption-status`, data),

  returningCheck: (id: number, signal?: AbortSignal) =>
    api.get<{
      is_returning: boolean
      records: Array<{
        id:              number
        regnumber:       string | null
        fname:           string | null
        lname:           string | null
        email:           string | null
        programme_level: string | null
        acc_year:        string | null
        faculty:         string | null
        department:      string | null
        current_level:   string | null
        student_state:   string | null
      }>
    }>(`/api/admin/applications/${id}/returning-check`, {}, signal),

  acceptOfferByAppId: (id: number) =>
    api.post<{ offer_id: number }>(`/api/admin/applications/${id}/accept-offer`),

  paymentSlipUrl: (id: number) => {
    const token = useAuthStore.getState().token;
    const base = import.meta.env.VITE_API_URL ?? "";
    return `${base}/api/admin/applications/${id}/payment-slip?token=${token}`;
  },

  /** Inline-streamable URL for the applicant's profile photo. Pass the
   *  photo id from the row as a cache key so a re-upload busts the
   *  browser cache. */
  photoUrl: (id: number, photoCacheKey?: string | null) => {
    if (!photoCacheKey) return null;
    const token = useAuthStore.getState().token;
    const base  = import.meta.env.VITE_API_URL ?? "";
    const v     = `&v=${encodeURIComponent(String(photoCacheKey))}`;
    return `${base}/api/admin/applications/${id}/photo?token=${token}${v}`;
  },

  exportUrl: (queryString: string) => {
    const token = useAuthStore.getState().token;
    const base = import.meta.env.VITE_API_URL ?? "";
    // Apply the global topbar campus scope to exports too, unless the
    // queryString already pins a campus_id.
    const params = new URLSearchParams(queryString);
    const scoped = withCampusScope({ campus_id: params.get('campus_id') ? Number(params.get('campus_id')) : undefined });
    if (scoped.campus_id != null && !params.has('campus_id')) {
      params.set('campus_id', String(scoped.campus_id));
    }
    const finalQs = params.toString();
    const sep = finalQs ? "&" : "";
    return `${base}/api/admin/applications/export?${finalQs}${sep}token=${token}`;
  },

  /** Task 1.12 — bulk applicant upload. */
  bulkUploadTemplateUrl: () => {
    const token = useAuthStore.getState().token;
    const base  = import.meta.env.VITE_API_URL ?? '';
    return `${base}/api/admin/applications/bulk-upload-template?token=${token}`;
  },

  /** Task 1.14 — applicant statistics report. */
  statistics: (
    params: {
      faculty_id?: number; department_id?: number; option_id?: number;
      campus_id?: number; level_id?: number; mode?: string;
      date_from?: string; date_to?: string;
    } = {},
    signal?: AbortSignal,
  ) =>
    api.get<{
      rows: Array<{
        faculty: string | null
        department: string | null
        program: string | null
        total: number
        new_count: number
        accepted_count: number
        enrolled_count: number
        withdrawn_count: number
      }>
      totals: { total: number; new_count: number; accepted_count: number; enrolled_count: number; withdrawn_count: number }
    }>(`/api/admin/applications/statistics`, withCampusScope(params), signal),

  /** Dry-run preview — parses the CSV server-side and returns per-row
   *  validation (missing required fields, duplicates, invalid values)
   *  so the modal can surface a preview before committing. */
  bulkValidate: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload<import('./studentService').BulkValidateResponse>(
      `/api/admin/applications/bulk-validate`,
      form,
    );
  },

  bulkUpload: (file: File, patchedRows?: import('./studentService').BulkPatchedRow[]) => {
    const form = new FormData();
    form.append('file', file);
    if (patchedRows && patchedRows.length > 0) {
      form.append('patched_rows', JSON.stringify(patchedRows));
    }
    return api.upload<{
      inserted: number;
      errors: Array<{ row: number; message: string }>;
    }>(`/api/admin/applications/bulk-upload`, form);
  },
}

/* ───────────────────────────────────────────────────────────────
 * Admin — document verification
 * permission: VERIFY_DOCUMENTS
 * ─────────────────────────────────────────────────────────────── */
export const verificationService = {
  getPendingApplications: (signal?: AbortSignal) =>
    api.get<PaginatedResponse<StudentApplication>>('/api/admin/verifications', {}, signal),

  getApplicationDocuments: (applicationId: number, signal?: AbortSignal) =>
    api.get<{ application: StudentApplication; documents: ApplicationDocument[] }>(`/api/admin/verifications/${applicationId}/documents`, {}, signal),

  verifyDocument: (applicationId: number, documentId: number, data: { verification_status: 'verified' | 'rejected'; comment?: string }) =>
    api.patch<null>(`/api/admin/verifications/${applicationId}/documents/${documentId}`, data),

  /** Request document changes (sends email for all rejected documents) */
  requestDocumentChanges: (
    applicationId: number,
    data: { message?: string; document_ids?: number[]; document_type_ids?: number[] } = {},
  ) =>
    api.post<null>(`/api/admin/verifications/${applicationId}/request-changes`, data),

  /** Returns the raw file server URL/redirect */
  downloadUrl: (applicationId: number, documentId: number) => {
    const token = useAuthStore.getState().token;
    const base = import.meta.env.VITE_API_URL ?? "";
    return `${base}/api/admin/verifications/${applicationId}/documents/${documentId}/download?token=${token}`;
  },
}

/* ───────────────────────────────────────────────────────────────
 * Admin — merit
 * permission: MANAGE_ADMISSIONS
 * ─────────────────────────────────────────────────────────────── */
export const meritService = {
  getCriteria: (params: { department_id: number; intake: string; academic_year_id: number }, signal?: AbortSignal) =>
    api.get<MeritCriteria | null>('/api/admin/merit/criteria', params, signal),

  saveCriteria: (d: MeritCriteria) =>
    api.post<{ id: number }>('/api/admin/merit/criteria', d),

  generate: (d: { department_id: number; intake: string; academic_year_id: number }) =>
    api.post<{ generated: number }>('/api/admin/merit/generate', d),

  getMeritList: (params: { department_id: number; intake: string; academic_year_id: number }, signal?: AbortSignal) =>
    api.get<PaginatedResponse<MeritListRow>>('/api/admin/merit/list', params, signal),

  publish: (d: { department_id: number; intake: string; academic_year_id: number }) =>
    api.patch<null>('/api/admin/merit/publish', d),
}

/* ───────────────────────────────────────────────────────────────
 * Admin — offers & enrollment
 * permission: MANAGE_ADMISSIONS
 * ─────────────────────────────────────────────────────────────── */
export const offerService = {
  list: (params: { status?: string; department_id?: number; intake?: string; enrolled_only?: '0' | '1' } = {}, signal?: AbortSignal) =>
    api.get<PaginatedResponse<AdmissionOffer>>('/api/admin/admissions/offers', params, signal),

  create: (d: { application_id: number; expires_at: string; notes?: string }) =>
    api.post<{ id: number; offer_letter_reference: string }>('/api/admin/admissions/offers', d),

  bulkCreate: (d: { department_id: number; intake: string; academic_year_id: number; expires_at: string }) =>
    api.post<{ created: number }>('/api/admin/admissions/offers/bulk', d),

  getDetails: (offerId: number, signal?: AbortSignal) =>
    api.get<AdmissionOffer>(`/api/admin/admissions/offers/${offerId}`, {}, signal),

  initiateEnrollment: (offerId: number) =>
    api.post<{ student_id: number }>(`/api/admin/admissions/offers/${offerId}/enroll`),

  initiateEnrollmentByAppId: (appId: number, data?: { level_id: number }) =>
    api.post<{ student_id: number }>(`/api/admin/applications/${appId}/enroll`, data || {}),

  sendLetter: (offerId: number) =>
    api.post<{ sent_to: string; letter_token: string; download_url: string }>(`/api/admin/admissions/offers/${offerId}/send-letter`),

  bulkSendLetters: (d: { department_id: number; intake: string; academic_year_id: number }) =>
    api.post<{ total: number; sent: number; errors: string[] }>('/api/admin/admissions/letters/bulk-send', d),

  /** Returns absolute URL for PDF download (admin, JWT-authenticated). */
  letterPdfUrl: (offerId: number, studentId?: number | null) => {
    const legacyUrl = (() => {
      if (studentId == null || Number.isNaN(Number(studentId))) return ''
      const url = new URL('https://cur.ac.rw/umis/documents/all_certificate/generate_document.php')
      url.searchParams.set('type', 'admission_letter')
      url.searchParams.set('student_id', String(studentId))
      url.searchParams.set('file_name', 'Admission_Letter_FORMAT.pdf')
      return url.toString()
    })()

    if (legacyUrl) return legacyUrl

    const token = useAuthStore.getState().token
    const base  = import.meta.env.VITE_API_URL ?? ''
    return `${base}/api/admin/admissions/offers/${offerId}/letter?token=${token}`
  },

  /** Returns absolute URL for applicant PDF download via token (no JWT). */
  letterPublicUrl: (letterToken: string) => {
    const base = import.meta.env.VITE_API_URL ?? ''
    return `${base}/api/portal/admission-letter?token=${letterToken}`
  },
}

/* ───────────────────────────────────────────────────────────────
 * Manual admission
 * permission: MANAGE_ADMISSIONS
 * ─────────────────────────────────────────────────────────────── */
export const manualAdmissionService = {
  admit: (d: { application_id: number; reason?: string; notes?: string; expires_at?: string }) =>
    api.post<{ offer_id: number; offer_letter_reference: string; expires_at: string }>('/api/admin/admissions/manual-admit', d),
}

/* ───────────────────────────────────────────────────────────────
 * Admission billing — the Registration / CURSU fees an admitted
 * applicant settles between the offer and the registration number.
 * Same shape on both ends: the applicant reads their own bills from
 * /api/applicant/*, a validator reads anyone's from /api/admin/*.
 * ─────────────────────────────────────────────────────────────── */

export interface AdmissionBill {
  id:             number
  fee_type:       string
  label:          string
  amount_due:     number
  amount_paid:    number
  balance:        number
  currency:       string
  status:         'unpaid' | 'partial' | 'paid' | 'cancelled'
  service_code:   string | null
  transaction_id: string | null
  paid_at:        string | null
  billed_at:      string | null
  /** Pre-filled Urubuto Pay deep link; null once the bill is settled. */
  checkout_url:   string | null
  merchant_code:  string
  payer_code:     string
}

export interface AdmissionBillPayment {
  id:               number
  amount:           number
  currency:         string
  payment_method:   string
  reference_number: string
  receipt_number:   string
  source:           'GATEWAY' | 'MANUAL'
  notes:            string | null
  paid_at:          string
  fee_type:         string
  label:            string
}

/** One line of what the applicant WOULD be billed. `amount: null` = no published price. */
export interface AdmissionBillable {
  fee_type:         string
  label:            string
  amount:           number | null
  currency:         string
  fee_structure_id: number | null
  service_code:     string | null
  reason:           string | null
}

export interface AdmissionBillingOverview {
  application_id:       number
  application_number:   string
  status:               string
  bills:                AdmissionBill[]
  payments:             AdmissionBillPayment[]
  summary: {
    total_due:  number
    total_paid: number
    balance:    number
    count:      number
    paid_count: number
    fully_paid: boolean
  }
  /** Validator-only pricing preview; absent on the applicant endpoint. */
  billable?:            AdmissionBillable[]
  is_billed:            boolean
  fully_paid:           boolean
  merchant_code:        string
  payer_code:           string
  checkout_url:         string | null
  offer_status:         string | null
  enrollment_initiated: boolean
  registration_number:  string | null
  auto_enroll:          boolean
}

/** Validator side — permission: MANAGE_STUDENT_APPLICATIONS */
export const admissionBillingService = {
  list: (appId: number, signal?: AbortSignal) =>
    api.get<AdmissionBillingOverview>(`/api/admin/applications/${appId}/bills`, {}, signal),

  /** Raise the bills. Omit fee_types to bill everything configured. */
  bill: (appId: number, feeTypes?: string[]) =>
    api.post<{ billed: AdmissionBill[]; skipped: Array<{ fee_type: string; reason: string }>; summary: AdmissionBillingOverview['summary'] }>(
      `/api/admin/applications/${appId}/bills`,
      feeTypes?.length ? { fee_types: feeTypes } : {},
    ),

  /** Record a payment that arrived outside the gateway (bank transfer, cash). */
  confirmPayment: (appId: number, billId: number, data: { amount: number; reference: string; notes?: string }) =>
    api.post<{ payment_id: number; receipt_number: string; summary: AdmissionBillingOverview['summary'] }>(
      `/api/admin/applications/${appId}/bills/${billId}/confirm`,
      data,
    ),

  checkout: (appId: number, feeType?: string, signal?: AbortSignal) =>
    api.get<{ checkout_url: string; payer_code: string; service_code: string | null; application_number: string }>(
      `/api/admin/applications/${appId}/bills/checkout`,
      feeType ? { fee_type: feeType } : {},
      signal,
    ),
}

/* ───────────────────────────────────────────────────────────────
 * Applicant portal (auth; requires is_applicant=true)
 * ─────────────────────────────────────────────────────────────── */
export const applicantService = {
  getProfile: (signal?: AbortSignal) =>
    api.get<{
      profile: ApplicantProfile;
      user: { email: string; full_name: string; username: string };
      application?: StudentApplication;
    }>('/api/applicant/profile', {}, signal),

  updateProfile: (d: Partial<ApplicantProfile>) =>
    api.put<null>('/api/applicant/profile', d),

  uploadPhoto: (file: File) => {
    const form = new FormData()
    form.append('photo', file)
    return api.upload<{ profile_photo_id: string; url: string | null }>('/api/applicant/profile/photo', form)
  },

  /** Remove the applicant's profile photo. */
  deletePhoto: () =>
    api.delete<{ profile_photo_id: null }>('/api/applicant/profile/photo'),

  // Note: there is deliberately no "I already paid" call here. UrubutoPay is
  // the only accepted channel for the application fee, so the only thing that
  // marks it paid is the gateway's own callback — the endpoints that accepted a
  // self-declared transaction id were removed along with the UI tab for them.

  /** Urubuto Pay — get the hosted-checkout URL for the application fee. */
  getPaymentCheckout: (signal?: AbortSignal) =>
    api.get<{
      checkout_url:       string
      merchant_code:      string
      payer_code:         string
      amount:             number
      currency:           string
      service_code:       string
      paid:               boolean
      transaction_id:     string | null
      application_number: string
    }>('/api/applicant/application/payment/checkout', {}, signal),

  /** Urubuto Pay — poll whether the application fee has been confirmed. */
  getPaymentStatus: (signal?: AbortSignal) =>
    api.get<{
      paid:               boolean
      transaction_id:     string | null
      paid_at:            string | null
      amount:             number | null
      currency:           string
      application_number: string | null
      status:             string | null
    }>('/api/applicant/application/payment/status', {}, signal),

  listApplications: (signal?: AbortSignal) =>
    api.get<StudentApplication[]>('/api/applicant/application', {}, signal),

  getApplicationDetails: (id: number, signal?: AbortSignal) =>
    api.get<StudentApplication & { document_checklist?: AdmissionRequirement[]; status_log?: ApplicationStatusLog[] }>(`/api/applicant/application/${id}`, {}, signal),

  /** Task 1.10 — lean timeline endpoint for the visual progress stepper. */
  getApplicationTimeline: (id: number, signal?: AbortSignal) =>
    api.get<{
      application_id: number
      current_status: string
      timeline: Array<{
        from_status: string | null
        to_status:   string
        actor_type:  'applicant' | 'admin' | 'system'
        notes:       string | null
        created_at:  string
        actor_name:  string | null
      }>
    }>(`/api/applicant/application/${id}/timeline`, {}, signal),

  updateApplication: (id: number, data: Partial<StudentApplication>) =>
    api.put<null>(`/api/applicant/application/${id}`, data),

  draftApplication: (data: { faculty_id: number; department_id: number; intake: string }) =>
    api.post<{ id: number; application_number: string }>('/api/applicant/application/draft', data),

  submitApplication: (data: Record<string, unknown>) =>
    api.post<{ status: string }>('/api/applicant/application/submit', data),

  verifyApplication: (data: { code: string }) =>
    api.post<null>('/api/applicant/application/verify', data),

  resendVerificationCode: () =>
    api.post<null>('/api/applicant/application/resend-code', {}),

  /* Academic records */
  listAcademicRecords: (signal?: AbortSignal) =>
    api.get<AcademicRecord[]>('/api/applicant/academic-records', {}, signal),

  addAcademicRecord: (d: Omit<AcademicRecord, 'id' | 'applicant_profile_id'> & { document_id?: number | null }) =>
    api.post<{ id: number }>('/api/applicant/academic-records', d),

  updateAcademicRecord: (id: number, d: Partial<AcademicRecord> & { document_id?: number | null }) =>
    api.put<null>(`/api/applicant/academic-records/${id}`, d),

  deleteAcademicRecord: (id: number) =>
    api.delete<null>(`/api/applicant/academic-records/${id}`),

  setPrimaryRecord: (id: number) =>
    api.post<null>(`/api/applicant/academic-records/${id}/set-primary`),

  /* Documents */
  listDocuments: (signal?: AbortSignal) =>
    api.get<{ documents: ApplicationDocument[] }>('/api/applicant/documents', {}, signal),

  /** Multipart upload — backend proxies to the file-server internally. */
  uploadDocument: (data: { document_type_id: number; file: File }) => {
    const form = new FormData()
    form.append('document_type_id', String(data.document_type_id))
    form.append('document', data.file)
    return api.upload<{
      id: number
      document_type_id: number
      document_type_name: string
      verification_status: 'pending' | 'verified' | 'rejected'
      document_status: string
    }>('/api/applicant/documents', form)
  },

  deleteDocument: (id: number) =>
    api.delete<null>(`/api/applicant/documents/${id}`),

  downloadUrl: (id: number) => {
    const token = useAuthStore.getState().token;
    const base = import.meta.env.VITE_API_URL ?? "";
    return `${base}/api/applicant/documents/${id}/download?token=${token}`;
  },

  paymentSlipUrl: (applicationId: number) => {
    const token = useAuthStore.getState().token;
    const base = import.meta.env.VITE_API_URL ?? "";
    return `${base}/api/applicant/application/${applicationId}/payment-slip?token=${token}`;
  },

  respondToOffer: (id: number, data: { response: 'accepted' | 'declined'; notes?: string }) =>
    api.post<{ status: string }>(`/api/applicant/application/${id}/respond`, data),

  /** Admission fees (Registration, CURSU …) raised after the offer. */
  getAdmissionBills: (signal?: AbortSignal) =>
    api.get<AdmissionBillingOverview>('/api/applicant/application/bills', {}, signal),

  /** Fresh checkout link for one bill, or for the whole balance when omitted. */
  getAdmissionBillCheckout: (feeType?: string, signal?: AbortSignal) =>
    api.get<{
      checkout_url:       string
      payer_code:         string
      service_code:       string | null
      amount:             number | null
      currency:           string
      application_number: string
    }>('/api/applicant/application/bills/checkout', feeType ? { fee_type: feeType } : {}, signal),
}

/* ───────────────────────────────────────────────────────────────
 * Admin — Intakes
 * permission: MANAGE_ADMISSIONS
 * ─────────────────────────────────────────────────────────────── */
export const intakeService = {
  list:   (signal?: AbortSignal) => api.get<any[]>('/api/admin/intakes', {}, signal),
  create: (d: any) => api.post<any>('/api/admin/intakes', d),
  update: (id: number, d: any) => api.put<any>(`/api/admin/intakes/${id}`, d),
  remove: (id: number) => api.delete<null>(`/api/admin/intakes/${id}`),
  toggle: (id: number) => api.patch<any>(`/api/admin/intakes/${id}/toggle`),
}
