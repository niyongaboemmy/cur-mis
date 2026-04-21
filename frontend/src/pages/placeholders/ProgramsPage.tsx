import { BookOpen } from 'lucide-react'
import ModulePreview from '@/components/layout/ModulePreview'

export default function ProgramsPage() {
  return (
    <ModulePreview
      icon={BookOpen}
      title="Academic Programs"
      subtitle="Faculties, departments, programs & courses — the curriculum spine of CUR."
      tone="mint"
      features={[
        { label: 'Faculties & departments', status: 'soon'    },
        { label: 'Program catalogue',       status: 'soon'    },
        { label: 'Course modules & units',  status: 'planned' },
        { label: 'Credit accreditation',    status: 'planned' },
        { label: 'Program learning outcomes', status: 'planned' },
      ]}
    />
  )
}
