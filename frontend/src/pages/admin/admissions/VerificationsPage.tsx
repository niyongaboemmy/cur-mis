import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileCheck2, Loader2, ChevronRight } from 'lucide-react'
import { verificationService } from '@/services/admissionService'

export default function VerificationsPage() {
  const q = useQuery({
    queryKey: ['admin', 'verifications'],
    queryFn:  () => verificationService.getPendingApplications(),
  })
  const apps = q.data?.data?.data ?? []

  return (
    <section className="card p-0 overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-ink-100">
        <FileCheck2 className="w-5 h-5 text-brand" />
        <div>
          <h2 className="section-title">Documents pending verification</h2>
          <p className="section-sub">{apps.length} application{apps.length === 1 ? '' : 's'} awaiting review</p>
        </div>
      </div>

      {q.isLoading ? (
        <p className="p-8 text-center text-ink-500 text-[13px] flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </p>
      ) : apps.length === 0 ? (
        <p className="p-10 text-center text-ink-500 text-[13px]">🎉 No pending verifications right now.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>App #</th>
                <th>Applicant</th>
                <th>Program</th>
                <th>Submitted</th>
                <th>Doc status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td className="font-mono text-[12px]">{a.application_number}</td>
                  <td>
                    <p className="font-medium text-ink-900 dark:text-ink-100">{a.first_name} {a.last_name}</p>
                    <p className="text-[11.5px] text-ink-500">{a.email}</p>
                  </td>
                  <td>{a.program_name ?? `#${a.program_id}`}</td>
                  <td>{a.submitted_at ?? a.created_at}</td>
                  <td><span className="chip-warning">{a.document_status}</span></td>
                  <td className="text-right">
                    <Link to={`/admin/admissions/applications/${a.id}`} className="btn-primary btn-sm">
                      Review <ChevronRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
