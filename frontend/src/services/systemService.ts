import { api } from '@/services/api'
import type { SystemBasics } from '@/types/academic'

export interface GuidanceVideos {
  video_application_guide_url: string
  video_login_guide_url:       string
}

export interface FeeMappingSettings {
  application_fee_mapped_fee_structure_id: string
  application_fee_credit_on_enrollment:    string
}

export interface FeeStructureOption {
  id:              number
  fee_type:        string
  label:           string
  amount:          string
  academic_year_id: number
  year_label:      string
  fee_type_label:  string | null
}

export interface FeeMappingResponse {
  settings:       FeeMappingSettings
  fee_structures: FeeStructureOption[]
}

export const systemService = {
  getBasics: (signal?: AbortSignal) =>
    api.get<SystemBasics>('/api/system/basics', {}, signal),

  /** Public — readable from the apply page and login page without auth. */
  getGuidanceVideos: (signal?: AbortSignal) =>
    api.get<GuidanceVideos>('/api/portal/guidance-videos', {}, signal),

  /** Admin — persist the two URLs (requires MANAGE_SETTINGS). */
  saveGuidanceVideos: (d: GuidanceVideos) =>
    api.put<GuidanceVideos>('/api/system/guidance-videos', d),

  /** Public — returns the live application fee amount (no auth required). */
  getPublicApplicationFee: (signal?: AbortSignal) =>
    api.get<{ amount: number; mapped_fee_type: string | null; academic_year_id: number | null }>(
      '/api/portal/application-fee', {}, signal
    ),

  /** Admin — fetch application fee mapping settings + available fee types. */
  getFeeMappingSettings: (signal?: AbortSignal) =>
    api.get<FeeMappingResponse>('/api/system/fee-mapping', {}, signal),

  /** Admin — save application fee mapping settings. */
  saveFeeMappingSettings: (d: {
    application_fee_mapped_fee_structure_id: number
    application_fee_credit_on_enrollment:    number
  }) => api.patch<FeeMappingSettings>('/api/system/fee-mapping', d),
}
