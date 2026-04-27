import { Mail, MapPin, Globe, Phone, Printer } from 'lucide-react'

interface AdmissionLetterProps {
  offer: {
    id?: number
    offer_letter_reference: string
    first_name: string
    last_name: string
    email: string
    phone?: string
    application_number: string
    department_name: string
    faculty_name?: string
    intake?: string
    offered_at?: string
    expires_at: string
    letter_token?: string
  }
  /** If true, renders a floating Print button outside the letter frame */
  showPrintButton?: boolean
}

export default function AdmissionLetter({ offer, showPrintButton = false }: AdmissionLetterProps) {
  const issueDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const expiryDate = (() => {
    try { return new Date(offer.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) }
    catch { return offer.expires_at }
  })()

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

      {/* Letter */}
      <div
        id="admission-letter-content"
        className="bg-white text-slate-900 max-w-[760px] mx-auto shadow-2xl print:shadow-none print:border-none leading-relaxed relative overflow-hidden"
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.025] pointer-events-none select-none -rotate-12 z-0">
          <p className="text-[110px] font-black tracking-tighter text-slate-900">CUR-MIS</p>
        </div>

        <div className="relative z-10">
          {/* Top accent bar */}
          <div className="h-2 bg-gradient-to-r from-blue-900 via-blue-600 to-blue-400" />

          {/* Header */}
          <div className="flex justify-between items-start px-12 pt-8 pb-6 border-b-2 border-slate-800">
            <div>
              <h1 className="text-[28px] font-black tracking-tighter text-blue-900" style={{ fontFamily: 'Arial, sans-serif' }}>CUR-MIS</h1>
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500 mt-1" style={{ fontFamily: 'Arial, sans-serif' }}>
                Catholic University of Rwanda · Management Information System
              </p>
              <p className="text-[9px] uppercase tracking-[0.12em] text-slate-400 mt-0.5" style={{ fontFamily: 'Arial, sans-serif' }}>
                Office of Academic Registrar
              </p>
            </div>
            <div className="text-right text-[10px] text-slate-500 space-y-1" style={{ fontFamily: 'Arial, sans-serif' }}>
              <p className="flex items-center justify-end gap-1.5"><MapPin className="w-2.5 h-2.5" /> KN 78 Street, Kigali, Rwanda</p>
              <p className="flex items-center justify-end gap-1.5"><Globe className="w-2.5 h-2.5" /> www.cur-mis.ac.rw</p>
              <p className="flex items-center justify-end gap-1.5"><Mail className="w-2.5 h-2.5" /> admissions@cur-mis.ac.rw</p>
              <p className="flex items-center justify-end gap-1.5"><Phone className="w-2.5 h-2.5" /> +250 788 000 000</p>
            </div>
          </div>

          <div className="px-12 py-8 space-y-6">
            {/* Reference & Date row */}
            <div className="flex justify-between items-end">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>Letter Reference</p>
                <p className="text-[14px] font-bold text-blue-900" style={{ fontFamily: "'Courier New', monospace" }}>{offer.offer_letter_reference}</p>
              </div>
              <p className="text-[13px] text-slate-600">Date: <strong>{issueDate}</strong></p>
            </div>

            {/* Addressee block */}
            <div className="pl-5 border-l-4 border-blue-800 py-2 bg-blue-50 rounded-r-lg">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-blue-400 mb-1" style={{ fontFamily: 'Arial, sans-serif' }}>Addressed To</p>
              <p className="text-[18px] font-black uppercase tracking-wide text-slate-900" style={{ fontFamily: 'Arial, sans-serif' }}>
                {offer.first_name} {offer.last_name}
              </p>
              <p className="text-[11px] text-slate-500 mt-1 space-x-2">
                <span>App. No: <strong className="text-slate-700">{offer.application_number}</strong></span>
                {offer.email && <span>· {offer.email}</span>}
                {offer.phone && <span>· {offer.phone}</span>}
              </p>
            </div>

            {/* Title */}
            <div className="text-center border-t border-b border-slate-200 py-4">
              <h2 className="text-[16px] font-black uppercase tracking-[0.12em] text-blue-900" style={{ fontFamily: 'Arial, sans-serif' }}>
                Letter of Provisional Admission
              </h2>
              {offer.intake && (
                <p className="text-[10px] text-slate-400 mt-1 tracking-widest uppercase font-bold" style={{ fontFamily: 'Arial, sans-serif' }}>
                  {offer.intake} Intake
                </p>
              )}
            </div>

            {/* Body */}
            <div className="space-y-4 text-[14px] text-slate-700" style={{ lineHeight: '1.75' }}>
              <p>Dear <strong className="text-slate-900">{offer.first_name}</strong>,</p>

              <p>
                On behalf of the <strong>Catholic University of Rwanda</strong>, it is with great pleasure that
                we inform you that, following a thorough review of your application and academic credentials,
                you have been granted <strong>Provisional Admission</strong> to the following programme:
              </p>

              {/* Programme Info Box */}
              <div className="border border-slate-200 rounded-lg overflow-hidden my-4">
                <div className="bg-blue-900 px-5 py-2.5">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200" style={{ fontFamily: 'Arial, sans-serif' }}>Programme Details</p>
                </div>
                <table className="w-full text-[13px]" style={{ fontFamily: 'Arial, sans-serif' }}>
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400 w-36">Programme</td>
                      <td className="px-5 py-2.5 font-bold text-slate-900">{offer.department_name}</td>
                    </tr>
                    {offer.faculty_name && (
                      <tr className="border-b border-slate-100">
                        <td className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Faculty</td>
                        <td className="px-5 py-2.5 text-slate-700">{offer.faculty_name}</td>
                      </tr>
                    )}
                    {offer.intake && (
                      <tr className="border-b border-slate-100">
                        <td className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Intake</td>
                        <td className="px-5 py-2.5 text-slate-700">{offer.intake}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-red-400">Offer Expires</td>
                      <td className="px-5 py-2.5 font-black text-red-600">{expiryDate}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p>
                This offer is <strong>provisional</strong> and subject to the successful verification of your
                original academic documents and the fulfillment of all administrative and financial requirements
                of the institution.
              </p>

              <p>
                To secure your place, you must formally <strong>accept this offer</strong> via the Applicant
                Portal before the expiry date shown above. Failure to respond by the deadline will result in
                automatic withdrawal of this offer.
              </p>

              {/* Conditions */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-[13px]">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-700 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>Conditions of Admission</p>
                <ol className="list-decimal list-inside space-y-1 text-amber-900" style={{ lineHeight: '1.7' }}>
                  <li>Submission and physical verification of all original academic certificates.</li>
                  <li>Payment of applicable registration and tuition fees by the due date.</li>
                  <li>Compliance with all university regulations, policies, and Code of Conduct.</li>
                  <li>This offer is non-transferable and applies to the stated programme and intake only.</li>
                </ol>
              </div>

              <p>
                We congratulate you on this achievement and look forward to welcoming you to our academic community.
              </p>
            </div>

            {/* Signature */}
            <div className="flex justify-between items-end mt-8 pt-4">
              <div className="min-w-[200px]">
                <div className="h-14 border-b border-slate-300 mb-2 relative">
                  <p className="absolute bottom-1 right-0 text-[9px] text-slate-300 italic" style={{ fontFamily: 'Arial, sans-serif' }}>Electronically Signed</p>
                </div>
                <p className="font-bold text-slate-900 text-[14px]">Dr. Jean Baptiste</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-0.5" style={{ fontFamily: 'Arial, sans-serif' }}>
                  Academic Registrar · CUR-MIS
                </p>
              </div>

              <div className="text-center p-4 border border-slate-200 rounded-xl bg-slate-50">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center mx-auto mb-2">
                  <p className="text-[8px] text-slate-400 text-center leading-tight uppercase tracking-wide" style={{ fontFamily: 'Arial, sans-serif' }}>Official<br/>Seal</p>
                </div>
                <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider" style={{ fontFamily: 'Arial, sans-serif' }}>CUR-MIS</p>
                <p className="text-[7px] font-mono text-slate-300 mt-0.5">{offer.offer_letter_reference}</p>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-5 border-t border-slate-100 text-center text-[9px] text-slate-400 uppercase tracking-[0.22em]" style={{ fontFamily: 'Arial, sans-serif' }}>
              Catholic University of Rwanda · Innovating Excellence in Higher Education
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
