import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types'
import type {
  Faculty, PortalDepartment, DocumentType, AdmissionRequirement,
  StudentApplication, ApplicationDocument, ApplicationStatusLog,
  ApplicationStatus, MeritCriteria, MeritListRow, AdmissionOffer,
  ApplicantProfile, AcademicRecord,
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

  getFacultyRequirements: (facultyId: number, signal?: AbortSignal) =>
    api.get<{ academic_year: { id: number; label: string }; faculty_id: number; requirements: AdmissionRequirement[] }>(`/api/portal/faculties/${facultyId}/requirements`, {}, signal),

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
 * Admin — admission requirements (per faculty per year)
 * ─────────────────────────────────────────────────────────────── */
export const admissionRequirementService = {
  list: (params: { faculty_id?: number; academic_year_id?: number } = {}, signal?: AbortSignal) =>
    api.get<AdmissionRequirement[]>('/api/admin/admission-requirements', params, signal),

  getForFacultyYear: (facultyId: number, yearId: number, signal?: AbortSignal) =>
    api.get<{
      faculty:         { id: number; name: string; code: string }
      academic_year:   { id: number; label: string }
      requirements:    AdmissionRequirement[]
      available_types: DocumentType[]
    }>(`/api/admin/admission-requirements/faculty/${facultyId}/year/${yearId}`, {}, signal),

  create: (d: Partial<AdmissionRequirement>) =>
    api.post<{ id: number }>('/api/admin/admission-requirements', d),

  copyToYear: (d: { from_year_id: number; to_year_id: number; faculty_id?: number }) =>
    api.post<null>('/api/admin/admission-requirements/copy', d),

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
    params: { page?: number; per_page?: number; status?: ApplicationStatus; department_id?: number; intake?: string; q?: string } = {},
    signal?: AbortSignal,
  ) => api.get<PaginatedResponse<StudentApplication>>('/api/admin/applications', params, signal),

  show: (id: number, signal?: AbortSignal) =>
    api.get<StudentApplication & { documents?: ApplicationDocument[]; status_log?: ApplicationStatusLog[] }>(
      `/api/admin/applications/${id}`, {}, signal,
    ),

  updateStatus: (id: number, data: { status: ApplicationStatus; notes?: string }) =>
    api.patch<null>(`/api/admin/applications/${id}/status`, data),

  addNote: (id: number, data: { notes: string }) =>
    api.post<null>(`/api/admin/applications/${id}/notes`, data),
}

/* ───────────────────────────────────────────────────────────────
 * Admin — document verification
 * permission: VERIFY_DOCUMENTS
 * ─────────────────────────────────────────────────────────────── */
export const verificationService = {
  getPendingApplications: (signal?: AbortSignal) =>
    api.get<PaginatedResponse<StudentApplication>>('/api/admin/verifications', {}, signal),

  getApplicationDocuments: (applicationId: number, signal?: AbortSignal) =>
    api.get<ApplicationDocument[]>(`/api/admin/verifications/${applicationId}/documents`, {}, signal),

  verifyDocument: (applicationId: number, documentId: number, data: { verification_status: 'verified' | 'rejected'; rejection_notes?: string }) =>
    api.patch<null>(`/api/admin/verifications/${applicationId}/documents/${documentId}`, data),

  /** Returns the raw file server URL/redirect */
  downloadUrl: (applicationId: number, documentId: number) =>
    `${import.meta.env.VITE_API_URL ?? ''}/api/admin/verifications/${applicationId}/documents/${documentId}/download`,
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
  list: (params: { status?: string } = {}, signal?: AbortSignal) =>
    api.get<PaginatedResponse<AdmissionOffer>>('/api/admin/admissions/offers', params, signal),

  create: (d: { application_id: number; expires_at: string; notes?: string }) =>
    api.post<{ id: number; offer_letter_reference: string }>('/api/admin/admissions/offers', d),

  bulkCreate: (d: { department_id: number; intake: string; academic_year_id: number; expires_at: string }) =>
    api.post<{ created: number }>('/api/admin/admissions/offers/bulk', d),

  getDetails: (offerId: number, signal?: AbortSignal) =>
    api.get<AdmissionOffer>(`/api/admin/admissions/offers/${offerId}`, {}, signal),

  initiateEnrollment: (offerId: number) =>
    api.post<{ student_id: number }>(`/api/admin/admissions/offers/${offerId}/enroll`),
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

  listApplications: (signal?: AbortSignal) =>
    api.get<StudentApplication[]>('/api/applicant/application', {}, signal),

  getApplicationDetails: (id: number, signal?: AbortSignal) =>
    api.get<StudentApplication & { document_checklist?: AdmissionRequirement[]; status_log?: ApplicationStatusLog[] }>(`/api/applicant/application/${id}`, {}, signal),

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

  addAcademicRecord: (d: Omit<AcademicRecord, 'id' | 'applicant_profile_id'>) =>
    api.post<{ id: number }>('/api/applicant/academic-records', d),

  updateAcademicRecord: (id: number, d: Partial<AcademicRecord>) =>
    api.put<null>(`/api/applicant/academic-records/${id}`, d),

  deleteAcademicRecord: (id: number) =>
    api.delete<null>(`/api/applicant/academic-records/${id}`),

  setPrimaryRecord: (id: number) =>
    api.post<null>(`/api/applicant/academic-records/${id}/set-primary`),

  /* Documents */
  listDocuments: (signal?: AbortSignal) =>
    api.get<ApplicationDocument[]>('/api/applicant/documents', {}, signal),

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
