import { CreditCard } from 'lucide-react'
import ModulePreview from '@/components/layout/ModulePreview'

export default function FinancePage() {
  return (
    <ModulePreview
      icon={CreditCard}
      title="Finance &amp; Billing"
      subtitle="Tuition, accommodation and service fees — clearly tracked for every CUR student."
      tone="peach"
      features={[
        { label: 'Fee structures per program', status: 'soon'    },
        { label: 'Student ledgers & balances', status: 'soon'    },
        { label: 'Online payments (MoMo, bank)', status: 'planned' },
        { label: 'Receipts & invoicing',       status: 'planned' },
        { label: 'Scholarships & bursaries',   status: 'planned' },
        { label: 'Financial reports',          status: 'planned' },
      ]}
    />
  )
}
