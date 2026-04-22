import { api } from '@/services/api'
import type { PaginatedResponse } from '@/types'
import type {
  Faculty, PortalProgram, DocumentType, AdmissionRequirement,
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

  getFaculties: (signal?: AbortSignal) =>
    api.get<Faculty[]>('/api/portal/faculties', {}, signal),

  getFacultyPrograms: (facultyId: number, signal?: AbortSignal) =>
    api.get<PortalProgram[]>(`/api/portal/faculties/${facultyId}/programs`, {}, signal),

  getFacultyRequirements: (facultyId: number, signal?: AbortSignal) =>
    api.get<AdmissionRequirement[]>(`/api/portal/faculties/${facultyId}/requirements`, {}, signal),

  submitApplication: (data: Record<string, unknown>) =>
    api.post<{ id: number; application_number: string }>('/api/portal/applications', data),

  trackApplication: (appNumber: string, signal?: AbortSignal) =>
    api.get<StudentApplication & { documents: ApplicationDocument[]; status_log?: ApplicationStatusLog[] }>(
      `/api/portal/applications/${appNumber}`, {}, signal,
    ),

  uploadDocument: (
    appNumber: string,
    data: { document_type_id: number; file_server_id: string; file_original_name?: string; file_size?: number; file_mime?: string },
  ) => api.post<{ id: number }>(`/api/portal/applications/${appNumber}/documents`, data),

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
    api.get<AdmissionRequirement[]>(
      `/api/admin/admission-requirements/faculty/${facultyId}/year/${yearId}`, {}, signal,
    ),

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
    params: { page?: number; per_page?: number; status?: ApplicationStatus; faculty_id?: number; q?: string } = {},
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
    api.get<StudentApplication[]>('/api/admin/verifications', {}, signal),

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
  getCriteria: (params: { program_id: number; intake: string; academic_year_id: number }, signal?: AbortSignal) =>
    api.get<MeritCriteria | null>('/api/admin/merit/criteria', params, signal),

  saveCriteria: (d: MeritCriteria) =>
    api.post<{ id: number }>('/api/admin/merit/criteria', d),

  generate: (d: { program_id: number; intake: string; academic_year_id: number }) =>
    api.post<{ generated: number }>('/api/admin/merit/generate', d),

  getMeritList: (params: { program_id: number; intake: string; academic_year_id: number }, signal?: AbortSignal) =>
    api.get<MeritListRow[]>('/api/admin/merit/list', params, signal),

  publish: (d: { program_id: number; intake: string; academic_year_id: number }) =>
    api.patch<null>('/api/admin/merit/publish', d),
}

/* ───────────────────────────────────────────────────────────────
 * Admin — offers & enrollment
 * permission: MANAGE_ADMISSIONS
 * ─────────────────────────────────────────────────────────────── */
export const offerService = {
  list: (params: { status?: string } = {}, signal?: AbortSignal) =>
    api.get<AdmissionOffer[]>('/api/admin/admissions/offers', params, signal),

  create: (d: { application_id: number; expires_at: string; notes?: string }) =>
    api.post<{ id: number; offer_letter_reference: string }>('/api/admin/admissions/offers', d),

  bulkCreate: (d: { application_ids: number[]; expires_at: string }) =>
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
    api.get<ApplicantProfile>('/api/applicant/profile', {}, signal),

  updateProfile: (d: Partial<ApplicantProfile>) =>
    api.put<null>('/api/applicant/profile', d),

  uploadPhoto: (d: { file_server_id: string }) =>
    api.post<null>('/api/applicant/profile/photo', d),

  getApplication: (signal?: AbortSignal) =>
    api.get<StudentApplication & { documents?: ApplicationDocument[] }>('/api/applicant/application', {}, signal),

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

  uploadDocument: (d: { document_type_id: number; file_server_id: string; file_original_name?: string; file_size?: number; file_mime?: string }) =>
    api.post<{ id: number }>('/api/applicant/documents', d),

  deleteDocument: (id: number) =>
    api.delete<null>(`/api/applicant/documents/${id}`),
}
