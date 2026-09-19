export interface DocumentTypeDef {
  slug: string
  label: string
  fileName: string
  group: 'Letters & attestations' | 'Certificates & clearance' | 'Degrees & diplomas' | 'Registration'
}

export const DOCUMENT_TYPES: DocumentTypeDef[] = [
  // Letters & attestations
  {
    slug: 'admission_letter',
    label: 'Admission Letter',
    fileName: 'Admission_Letter_FORMAT.pdf',
    group: 'Letters & attestations',
  },
  {
    slug: 'enrollment_letter',
    label: 'Enrollment Letter',
    fileName: 'Enrollment_Letter.pdf',
    group: 'Letters & attestations',
  },
  {
    slug: 'to_whom_ongoing',
    label: 'To Whom It May Concern — Ongoing',
    fileName: 'To_Whom_Ongoing.pdf',
    group: 'Letters & attestations',
  },
  {
    slug: 'to_whom_completion',
    label: 'To Whom It May Concern — Completion',
    fileName: 'To_Whom_Completion.pdf',
    group: 'Letters & attestations',
  },
  {
    slug: 'to_whom_visa',
    label: 'To Whom It May Concern — Visa',
    fileName: 'To_Whom_Visa.pdf',
    group: 'Letters & attestations',
  },
  {
    slug: 'recommendation_letter',
    label: 'Recommendation Letter',
    fileName: 'Recommendation_Letter.pdf',
    group: 'Letters & attestations',
  },
  {
    slug: 'internship_letter',
    label: 'Internship Letter',
    fileName: 'Internship_Letter.pdf',
    group: 'Letters & attestations',
  },
  {
    slug: 'completion_letter',
    label: 'Completion Letter',
    fileName: 'Completion_Letter.pdf',
    group: 'Letters & attestations',
  },

  // Certificates & clearance
  {
    slug: 'english_proficiency',
    label: 'English Proficiency Certificate',
    fileName: 'English_Proficiency_CERTIFICATE.pdf',
    group: 'Certificates & clearance',
  },
  {
    slug: 'payment_proof',
    label: 'Payment Proof',
    fileName: 'Payment_Proof.pdf',
    group: 'Certificates & clearance',
  },
  {
    slug: 'financial_clearance',
    label: 'Financial Clearance',
    fileName: 'Financial_Clearance.pdf',
    group: 'Certificates & clearance',
  },
  {
    slug: 'completed_modules_letter',
    label: 'Completed Modules Letter',
    fileName: 'Completed_Modules_Letter.pdf',
    group: 'Certificates & clearance',
  },
  {
    slug: 'completed_modules',
    label: 'Completed Modules (Full List)',
    fileName: 'Completed_Modules.pdf',
    group: 'Certificates & clearance',
  },

  // Degrees & diplomas
  {
    slug: 'transcript',
    label: 'Academic Transcript',
    fileName: 'Academic_Transcript.pdf',
    group: 'Degrees & diplomas',
  },
  {
    slug: 'degree_certificate',
    label: 'Degree Certificate',
    fileName: 'Degree_Certificate.pdf',
    group: 'Degrees & diplomas',
  },
  {
    slug: 'transcript_diploma',
    label: 'Diploma Transcript',
    fileName: 'Diploma_Transcript.pdf',
    group: 'Degrees & diplomas',
  },
  {
    slug: 'diploma_supplement',
    label: 'Diploma Supplement',
    fileName: 'Diploma_Supplement.pdf',
    group: 'Degrees & diplomas',
  },
  {
    slug: 'degree_supplement',
    label: 'Degree Supplement',
    fileName: 'Degree_Supplement.pdf',
    group: 'Degrees & diplomas',
  },

  // Registration
  {
    slug: 'generic_document',
    label: 'Registration Form',
    fileName: 'Registration_Form.pdf',
    group: 'Registration',
  },
]
