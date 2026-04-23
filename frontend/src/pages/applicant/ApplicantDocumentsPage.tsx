import { useQuery } from '@tanstack/react-query'
import { applicantService, portalService } from '@/services/admissionService'
import DocumentsUploader from '@/components/ui/DocumentsUploader'
import { Card, SectionHeader, Loading } from '@/components/applicant/ApplicantPortalShared'

export default function ApplicantDocumentsPage() {
  const appsQ = useQuery({ queryKey: ['applicant', 'applications'], queryFn: () => applicantService.listApplications() })
  const apps = appsQ.data?.data ?? []
  
  // We'll use the first application's faculty for requirements for now
  const activeApp = apps[0] 
  
  const docsQ = useQuery({
    queryKey: ['applicant', 'documents', activeApp?.id],
    queryFn: () => applicantService.listDocuments(),
    enabled: !!activeApp?.id
  })

  const reqQ = useQuery({
    queryKey: ['portal', 'requirements', activeApp?.faculty_id],
    queryFn: () => portalService.getFacultyRequirements(activeApp!.faculty_id),
    enabled: !!activeApp?.faculty_id
  })

  const uploaded = docsQ.data?.data ?? []
  const requirements = reqQ.data?.data?.requirements ?? []
  
  return (
    <div className="max-w-5xl mx-auto">
      <Card>
        <SectionHeader title="Documents" sub="Upload each required document from your checklist." />
        <div className="mt-4">
          {docsQ.isLoading || reqQ.isLoading || appsQ.isLoading ? (
            <Loading />
          ) : !activeApp ? (
            <p className="text-[13px] text-ink-500 text-center py-12">No application found. Please start an application to see document requirements.</p>
          ) : (
            <DocumentsUploader 
              requirements={requirements} 
              uploaded={uploaded} 
              onUpload={({ document_type_id, file }) => applicantService.uploadDocument({ document_type_id, file })} 
              invalidateKeys={[['applicant', 'documents', activeApp.id], ['applicant', 'applications']]} 
            />
          )}
        </div>
      </Card>
    </div>
  )
}
