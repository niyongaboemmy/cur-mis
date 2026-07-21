export interface ServiceCatalogStage {
  id?: number
  service_id?: number
  stage_order: number
  stage_key: string
  stage_label: string
  required_permission_slug: string
  stage_type?: 'approval' | 'payment'
  is_final_approval: boolean | 0 | 1
  sla_hours?: number | null
}

export interface RequiredAttachment {
  key: string
  label: string
  mime_types: string[]
  max_size_kb: number
  required: boolean
}

export interface ServiceCatalogPublic {
  id: number
  code: string
  name: string
  slug: string
  category: string | null
  short_description: string | null
  fee_amount: number
  fee_currency: string
  requires_payment: boolean
  processing_sla_days: number | null
}

export interface PublicStage {
  stage_order: number
  stage_label: string
}

export interface ServiceCatalogDetail extends ServiceCatalogPublic {
  full_description: string | null
  requirements: string[]
  required_attachments: RequiredAttachment[]
  stage_count: number
  stages: PublicStage[]
}

export type StepState = 'completed' | 'current' | 'pending' | 'rejected' | 'changes_requested' | 'cancelled' | 'skipped'

export interface RequestStep {
  key: string
  label: string
  state: StepState
}

export interface RequestProgress {
  request_code: string
  status: string
  steps: RequestStep[]
  current_step: number
  total_steps: number
}

export interface ServiceCatalogAdmin {
  id: number
  code: string
  name: string
  slug: string
  category: string | null
  short_description: string | null
  full_description: string | null
  requirements: string[]
  required_attachments: RequiredAttachment[]
  document_template_type: string
  fee_amount: string | number
  fee_currency: string
  requires_payment: 0 | 1
  payment_stage: 'after_final_approval' | 'before_review'
  processing_sla_days: number | null
  is_active: 0 | 1
  stage_count?: number
  request_count?: number
  stages: ServiceCatalogStage[]
}

export interface ServiceRequestSummary {
  id: number
  request_code: string
  service_id: number
  service_name: string
  service_slug: string
  status: string
  current_stage_order: number
  full_name: string
  invoice_id: number | null
  download_token: string | null
  submitted_at: string | null
  completed_at: string | null
  created_at: string
}

export interface ServiceRequestApproval {
  id: number
  service_request_id: number
  stage_order: number
  stage_key: string
  actor_id: number | null
  actor_name: string | null
  actor_role: string | null
  decision: 'submitted' | 'approved' | 'rejected' | 'changes_requested' | 'payment_confirmed'
  comment: string | null
  decided_at: string
}
