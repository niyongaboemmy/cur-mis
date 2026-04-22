import { GraduationCap } from 'lucide-react'
import ModulePreview from '@/components/layout/ModulePreview'

export default function StudentsPage() {
  return (
    <ModulePreview
      icon={GraduationCap}
      title="Student Registry"
      subtitle="A single source of truth for every CUR student — from admission through graduation."
      tone="lilac"
      features={[
        { label: 'Admissions pipeline', status: 'soon' },
        { label: 'Student profile & records', status: 'soon' },
        { label: 'Enrolment per semester', status: 'planned' },
        { label: 'Transcript generation', status: 'planned' },
        { label: 'ID card issuance', status: 'planned' },
        { label: 'Alumni directory', status: 'planned' },
      ]}
    />
  )
}
