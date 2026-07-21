import { api } from '@/services/api'
import type { ServiceCatalogPublic, ServiceCatalogDetail, ServiceCatalogAdmin, ServiceCatalogStage } from '@/types/serviceRequest'

export interface ServiceCatalogFormPayload {
  code: string
  name: string
  slug: string
  category?: string | null
  short_description?: string | null
  full_description?: string | null
  requirements?: string[]
  required_attachments?: Array<{ key: string; label: string; mime_types: string[]; max_size_kb: number; required: boolean }>
  document_template_type?: string
  fee_amount: number
  fee_currency?: string
  requires_payment: boolean
  payment_stage?: 'after_final_approval' | 'before_review'
  processing_sla_days?: number | null
  is_active?: boolean
  stages: ServiceCatalogStage[]
}

export const serviceCatalogService = {
  getPublicList: (signal?: AbortSignal) =>
    api.get<ServiceCatalogPublic[]>('/api/services', {}, signal),

  getPublicDetail: (slug: string, signal?: AbortSignal) =>
    api.get<ServiceCatalogDetail>(`/api/services/${slug}`, {}, signal),

  listAdmin: (signal?: AbortSignal) =>
    api.get<ServiceCatalogAdmin[]>('/api/admin/service-catalog', {}, signal),

  getAdmin: (id: number, signal?: AbortSignal) =>
    api.get<ServiceCatalogAdmin>(`/api/admin/service-catalog/${id}`, {}, signal),

  create: (payload: ServiceCatalogFormPayload) =>
    api.post<{ id: number }>('/api/admin/service-catalog', payload),

  update: (id: number, payload: Partial<ServiceCatalogFormPayload>) =>
    api.post<null>(`/api/admin/service-catalog/${id}`, payload),

  deactivate: (id: number) =>
    api.post<null>(`/api/admin/service-catalog/${id}/deactivate`),
}
