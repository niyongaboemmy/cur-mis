import { Activity } from 'lucide-react'
import ModulePreview from '@/components/layout/ModulePreview'

export default function LogsPage() {
  return (
    <ModulePreview
      icon={Activity}
      title="System Logs"
      subtitle="A transparent audit trail of every sensitive action across the platform."
      tone="lilac"
      features={[
        { label: 'Authentication & session events', status: 'soon'    },
        { label: 'Permission &amp; role changes',       status: 'soon'    },
        { label: 'Record-level audit (who / when / what)', status: 'planned' },
        { label: 'Exportable compliance reports',   status: 'planned' },
        { label: 'Retention &amp; archiving policy',    status: 'planned' },
      ]}
    />
  )
}
