import { ClipboardList } from 'lucide-react'
import ModulePreview from '@/components/layout/ModulePreview'

export default function ExamsPage() {
  return (
    <ModulePreview
      icon={ClipboardList}
      title="Examinations &amp; Results"
      subtitle="From sitting an exam to printing the transcript — the whole assessment loop in one place."
      tone="sky"
      features={[
        { label: 'Exam sessions & timetables', status: 'soon'    },
        { label: 'Marks entry &amp; moderation', status: 'soon'    },
        { label: 'GPA &amp; grade points',     status: 'planned' },
        { label: 'Transcripts &amp; statements of results', status: 'planned' },
        { label: 'Graduation list approvals',  status: 'planned' },
      ]}
    />
  )
}
