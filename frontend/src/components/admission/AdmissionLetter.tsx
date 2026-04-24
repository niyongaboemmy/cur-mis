import { Mail, MapPin, Globe, Phone } from 'lucide-react'

interface AdmissionLetterProps {
  offer: {
    offer_letter_reference: string
    first_name: string
    last_name: string
    email: string
    application_number: string
    department_name: string
    offered_at: string
    expires_at: string
  }
}

export default function AdmissionLetter({ offer }: AdmissionLetterProps) {
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  return (
    <div className="bg-white text-slate-900 p-12 max-w-[800px] mx-auto shadow-2xl border border-slate-100 print:shadow-none print:border-none print:p-0 leading-relaxed font-serif relative overflow-hidden">
      {/* Subtle Watermark */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none -rotate-12">
        <p className="text-[120px] font-black tracking-tighter">CUR-MIS</p>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-8 relative z-10">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-slate-900">CUR-MIS</h1>
          <p className="text-[11px] font-sans font-bold uppercase tracking-widest text-slate-500 mt-1">University Management System</p>
        </div>
        <div className="text-right text-[11px] font-sans text-slate-500 space-y-0.5">
          <p className="flex items-center justify-end gap-1.5"><MapPin className="w-3 h-3" /> Kigali, Rwanda · KN 78 St</p>
          <p className="flex items-center justify-end gap-1.5"><Globe className="w-3 h-3" /> www.cur-mis.ac.rw</p>
          <p className="flex items-center justify-end gap-1.5"><Mail className="w-3 h-3" /> admissions@cur-mis.ac.rw</p>
          <p className="flex items-center justify-end gap-1.5"><Phone className="w-3 h-3" /> +250 788 000 000</p>
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex justify-between items-end mb-10">
          <div>
            <p className="text-[13px] font-sans font-bold text-slate-500 uppercase tracking-widest mb-1">Reference Number</p>
            <p className="text-lg font-mono font-bold text-slate-900">{offer.offer_letter_reference}</p>
          </div>
          <p className="text-[14px] font-bold">{today}</p>
        </div>

        <div className="mb-8">
          <p className="text-[15px] mb-1">To,</p>
          <p className="text-xl font-bold text-slate-900 uppercase">{offer.first_name} {offer.last_name}</p>
          <p className="text-[14px] text-slate-600">Application No: {offer.application_number}</p>
          <p className="text-[14px] text-slate-600">{offer.email}</p>
        </div>

        <h2 className="text-2xl font-black text-center border-y border-slate-200 py-3 mb-10 uppercase tracking-tight">
          Letter of Provisional Admission
        </h2>

        <div className="space-y-6 text-[15.5px]">
          <p>Dear <span className="font-bold">{offer.first_name}</span>,</p>
          
          <p>
            Following your application for admission to CUR-MIS, I am pleased to inform you that you have been 
            granted provisional admission to the <span className="font-bold underline decoration-slate-300 decoration-2 underline-offset-4">{offer.department_name}</span> program 
            for the upcoming academic intake.
          </p>

          <p>
            This offer is subject to the verification of your original academic documents and the fulfillment 
            of all administrative requirements. To secure your place, you are required to confirm your 
            acceptance through the Applicant Portal before <span className="font-bold text-slate-900 underline">{new Date(offer.expires_at).toLocaleDateString()}</span>.
          </p>

          <p>
            Upon acceptance, you will be issued a permanent Registration Number and further instructions 
            regarding orientation and course registration will be provided.
          </p>

          <p>
            We congratulate you on your selection and look forward to welcoming you to our academic community.
          </p>
        </div>

        <div className="mt-16 flex justify-between items-end">
          <div className="space-y-1">
            <div className="w-40 h-16 border-b border-slate-300 mb-2 relative">
               {/* Placeholder for signature */}
               <p className="absolute bottom-1 right-2 text-[10px] text-slate-300 italic font-sans">Electronically Signed</p>
            </div>
            <p className="font-bold text-slate-900">Dr. Jean Baptiste</p>
            <p className="text-[12px] font-sans text-slate-500 uppercase tracking-widest font-bold">Registrar, CUR-MIS</p>
          </div>
          
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center">
            <div className="w-20 h-20 bg-slate-200 rounded flex items-center justify-center mb-2">
              <p className="text-[10px] text-slate-400 font-sans text-center px-2">OFFICIAL SEAL</p>
            </div>
            <p className="text-[9px] font-mono text-slate-400">VERIFY AT PORTAL.CUR-MIS.RW</p>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-16 pt-6 border-t border-slate-100 text-[10px] text-slate-400 font-sans text-center uppercase tracking-[0.2em]">
          Innovating Excellence in Higher Education
        </div>
      </div>
    </div>
  )
}
