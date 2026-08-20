import { Printer } from 'lucide-react'

interface AdmissionLetterProps {
  offer: {
    id?: number
    offer_letter_reference: string
    first_name: string
    last_name: string
    email?: string
    phone?: string
    application_number: string
    department_name: string
    faculty_name?: string
    intake?: string
    level_name?: string
    mode_of_study?: string
    academic_year?: string
    offered_at?: string
    expires_at?: string
    letter_token?: string
  }
  /** If true, renders a floating Print button outside the letter frame */
  showPrintButton?: boolean
}

// "Faculty of Health Sciences" → "Health Sciences" so the body can re-prefix safely.
function stripFacultyPrefix(name: string): string {
  return name.replace(/^\s*faculty\s+of\s+/i, '').trim()
}

// "S5" → "Semester 5", anything else passes through unchanged.
function formatIntake(raw: string): string {
  const m = raw.trim().match(/^S(\d+)$/i)
  return m ? `Semester ${m[1]}` : raw
}

function formatTodayMDY(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}-${d.getFullYear()}`
}

export default function AdmissionLetter({ offer, showPrintButton = false }: AdmissionLetterProps) {
  const today      = formatTodayMDY()
  const fullName   = `${offer.first_name ?? ''} ${offer.last_name ?? ''}`.trim().toUpperCase()
  const faculty    = stripFacultyPrefix(offer.faculty_name ?? '')
  const department = offer.department_name ?? ''
  const level      = offer.level_name ?? ''
  const intake     = formatIntake(offer.intake ?? '')
  const program    = (offer.mode_of_study ?? 'Day').charAt(0).toUpperCase() +
                     (offer.mode_of_study ?? 'Day').slice(1).toLowerCase()
  const accYear    = offer.academic_year ?? String(new Date().getFullYear())

  return (
    <div className="relative">
      {showPrintButton && (
        <div className="flex justify-end mb-4 print:hidden">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-[12px] font-bold rounded-lg transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print / Save as PDF
          </button>
        </div>
      )}

      {/* Letter — A4-like canvas, Times New Roman, black ink */}
      <div
        id="admission-letter-content"
        className="bg-white text-black max-w-[820px] mx-auto shadow-2xl print:shadow-none print:border-none relative"
        style={{
          fontFamily: "'Times New Roman', Times, serif",
          fontSize: '11pt',
          lineHeight: 1.55,
          padding: '30px 44px 28px 44px',
        }}
      >
        {/* CUR letterhead bar */}
        <div style={{ marginBottom: 18 }}>
          <img
            src="/header_bar.jpeg"
            alt="Catholic University of Rwanda"
            style={{ width: '100%', maxHeight: 90, objectFit: 'contain' }}
          />
        </div>

        {/* Title row — registrar office + COPY watermark */}
        <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: 16, borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ fontWeight: 'bold', verticalAlign: 'top' }}>
                OFFICE OF THE ACADEMIC REGISTRAR
              </td>
              <td
                width={110}
                style={{
                  textAlign: 'right',
                  verticalAlign: 'top',
                  color: '#cc0000',
                  fontSize: '30pt',
                  fontWeight: 'bold',
                  lineHeight: 1,
                }}
              >
                COPY
              </td>
            </tr>
          </tbody>
        </table>

        <p style={{ fontWeight: 'bold' }}>TABA, {today}</p>
        <br />
        <p style={{ fontWeight: 'bold' }}>Re: Admission Letter</p>
        <br />
        <p style={{ fontWeight: 'bold', textDecoration: 'underline', margin: '14px 0' }}>
          For: {fullName}
        </p>
        <br />

        <p style={{ marginBottom: 13, textAlign: 'justify' }}>
          Referring to your application received on <strong>{today}</strong> to study at the
          Catholic University of Rwanda, with the recommendations of the Faculty, I am pleased
          to inform you that your request was accepted. You are hence admitted as a Full-Time
          student in the <strong>Faculty of {faculty}</strong>, Department of{' '}
          <strong>{department}</strong> . <strong>{level} {intake}</strong>,
          Program: <strong>{program}</strong>, Academic Year: <strong>{accYear}</strong>.
        </p>

        <p>However, you will receive your registration number after:</p>
        <ul style={{ margin: '0 0 13px 22px' }}>
          <li style={{ marginBottom: 4 }}>
            Submission of:
            <ol style={{ margin: '3px 0 3px 26px', listStyleType: 'lower-alpha' }}>
              <li style={{ marginBottom: 2 }}>
                The index number issued by the Rwanda Allied Health Professional Council
                (RAHPC) for Biomedical Laboratory Sciences and Public Health and Human
                Nutrition, or by the National Council of Nurses and Midwives (NCNM)
                for Nursing and Midwifery.
              </li>
              <li style={{ marginBottom: 2 }}>
                The exemption letter if you are an upgrading candidate.
              </li>
            </ol>
          </li>
          <li style={{ marginBottom: 4 }}>
            Fulfillment of financial requirements as detailed in the fees structure
            (see attached).
          </li>
        </ul>

        <p style={{ marginBottom: 13, textAlign: 'justify' }}>Yours sincerely,</p>

        <div style={{ marginTop: 22 }}>
          <p style={{ fontWeight: 'bold' }}>MUTAYOMBA Sylvestre</p>
          <p>Academic Registrar</p>
        </div>

        {/* CC list with QR placeholder on the right */}
        <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginTop: 18, borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ verticalAlign: 'top' }}>
                <p>CC:</p>
                <ul style={{ margin: '0 0 13px 22px' }}>
                  <li style={{ marginBottom: 4 }}>Dean of Faculty of {faculty}</li>
                  <li style={{ marginBottom: 4 }}>Academic Vice Rector</li>
                  <li style={{ marginBottom: 4 }}>Director of Administration and Finance</li>
                </ul>
              </td>
              <td width={100} style={{ textAlign: 'right', verticalAlign: 'top' }}>
                <div
                  style={{
                    display: 'inline-block',
                    width: 72,
                    height: 72,
                    border: '1px solid #bbb',
                    fontSize: '7pt',
                    color: '#999',
                    textAlign: 'center',
                    lineHeight: '72px',
                  }}
                >
                  QR
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ textAlign: 'right', marginTop: 6 }}>
          <span style={{ fontSize: '7.5pt', color: '#555' }}>
            Automatically Generated by CUR MIS
          </span>
        </div>

        <p style={{ textAlign: 'center', fontStyle: 'italic', marginTop: 16, fontSize: '10.5pt' }}>
          Audi et Aude
        </p>
      </div>
    </div>
  )
}
