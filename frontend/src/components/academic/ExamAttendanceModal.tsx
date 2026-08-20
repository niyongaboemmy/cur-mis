import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import {
  X,
  Printer,
  Download,
  Loader2,
  Users,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { academicsMgmtService } from '@/services/academicsMgmtService'

interface Props {
  examId:  number | null
  onClose: () => void
}

/* ─────────────────────────────────────────────────────────────
   Per-exam attendance sheet. Mirrors the university template:
   FACULTY OF / MODULE TITLE / MODULE CODE / COMPONENT / DATE /
   LECTURER'S NAMES / CAMPUS in the header, then the roster table
   with No / First name / Last name / Reg number / Day or Weekend
   / Option / Semester / SIGN IN / SIGN OUT.

   Renders as a modal on screen; prints as a clean A4 sheet and
   exports the same data to .xlsx so admins can hand it to
   invigilators in either format.
   ───────────────────────────────────────────────────────────── */

export default function ExamAttendanceModal({ examId, onClose }: Props) {
  const open = examId !== null

  // Close on Escape + lock body scroll while open. Mirrors the
  // shared Modal component's behaviour without sharing markup
  // because we need the *unstyled* sheet for printing.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const attQ = useQuery({
    queryKey: ['exam', 'attendance', examId],
    queryFn:  () => academicsMgmtService.examAttendance(examId!),
    enabled:  open,
  })
  const data    = attQ.data?.data
  const header  = data?.header
  const roster  = data?.roster ?? []

  const downloadXlsx = () => {
    if (!header) return
    const headerRows: any[][] = [
      [`FACULTY OF ${header.fac_name ?? ''}`],
      [`MODULE TITLE: ${header.module_name}`,                                  '', '', '', `Module Code: ${header.module_code}`],
      [`COMPONENT: ${header.component}`,                                       '', '', '', `Date: ${formatExamDateTime(header)}`],
      [`LECTURER'S NAMES: ${header.instructor_name ?? ''}`,                    '', '', '', `Campus: ${header.campus_name ?? ''}`],
      [],
      ['EXAM ATTENDANCE LIST'],
      ['No', 'FIRST NAME A-Z (Family Name)', 'Last Name / Other Name', 'Reg Number',
       'Day or Weekend', 'Option', 'Semester', 'SIGN IN', 'SIGN OUT'],
    ]
    const rows = roster.map((r, i) => [
      i + 1,
      r.first_name,
      r.last_name,
      r.regnumber,
      r.attendance_mode ?? '',
      r.option_acro ?? '',
      r.semester ?? '',
      '',
      '',
    ])
    const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...rows])
    // Column widths roughly aligned with the source sheet so the
    // exported file doesn't need manual fix-up before printing.
    ws['!cols'] = [
      { wch:  4 }, { wch: 26 }, { wch: 22 }, { wch: 18 },
      { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'For Exam')
    const safeName = `${header.module_code}_${header.exam_date ?? 'exam'}_attendance.xlsx`
      .replace(/[\\/?*[\]]/g, '_')
    XLSX.writeFile(wb, safeName)
  }

  /* Print: open a new window with just the sheet markup +
     print-friendly inline styles. Avoids fighting the rest of the
     app's CSS and keeps the printed page as close to the
     spreadsheet as we can get. */
  const printSheet = () => {
    if (!header) return
    const win = window.open('', '_blank', 'width=1024,height=768')
    if (!win) return
    win.document.write(buildPrintHtml(header, roster))
    win.document.close()
    win.focus()
    // Give the new document a tick to layout before triggering
    // the print dialog — Chrome/Firefox occasionally fire too
    // early and print a blank page if we don't.
    setTimeout(() => { win.print() }, 250)
  }

  const dateLabel = useMemo(() => header ? formatExamDateTime(header) : '', [header])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            key="att-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            key="att-panel"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative z-10 w-full max-w-5xl bg-white rounded-xl shadow-2xl flex flex-col max-h-[92vh] dark:bg-ink-800"
            role="dialog"
            aria-modal="true"
            aria-label="Exam attendance sheet"
          >
            {/* Modal toolbar — hidden in the print view */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0 dark:border-ink-700">
              <h2 className="text-[14.5px] font-semibold text-gray-900 inline-flex items-center gap-2 dark:text-white">
                <Users className="w-4 h-4" /> Exam attendance list
              </h2>
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary btn-sm"
                  onClick={downloadXlsx}
                  disabled={!header}
                  title="Download .xlsx"
                >
                  <Download className="w-3.5 h-3.5" /> Excel
                </button>
                <button
                  className="btn-primary btn-sm"
                  onClick={printSheet}
                  disabled={!header}
                  title="Print as PDF"
                >
                  <Printer className="w-3.5 h-3.5" /> Print / PDF
                </button>
                <button
                  onClick={onClose}
                  className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors dark:text-ink-400 dark:hover:text-ink-200 dark:hover:bg-ink-700"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 bg-gray-50 dark:bg-ink-900/40">
              {attQ.isLoading ? (
                <div className="py-16 flex items-center justify-center text-gray-500 text-[13px] dark:text-ink-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading attendance…
                </div>
              ) : !header ? (
                <div className="py-16 text-center text-gray-500 text-[13px] dark:text-ink-400">
                  Could not load this exam.
                </div>
              ) : (
                <div className="bg-white border border-gray-300 shadow-sm mx-auto p-6 max-w-[210mm] print:shadow-none print:border-none">
                  {/* ── HEADER (mirrors the spreadsheet layout) ── */}
                  <div className="font-serif text-[12.5px] text-gray-900 space-y-1.5">
                    <div className="font-bold tracking-wide">
                      FACULTY OF {(header.fac_name ?? '').toUpperCase()}
                    </div>
                    <div className="grid grid-cols-[1fr_220px] gap-3">
                      <div>
                        <span className="font-bold">MODULE TITLE: </span>
                        <span className="border-b border-dotted border-gray-500">
                          {header.module_name}
                        </span>
                      </div>
                      <div>
                        <span className="font-bold">Module Code: </span>
                        <span className="border-b border-dotted border-gray-500">
                          {header.module_code}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_220px] gap-3">
                      <div>
                        <span className="font-bold">COMPONENT: </span>
                        <span className="border-b border-dotted border-gray-500">
                          {header.component}
                        </span>
                      </div>
                      <div>
                        <span className="font-bold">Date: </span>
                        <span className="border-b border-dotted border-gray-500">
                          {dateLabel}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_220px] gap-3">
                      <div>
                        <span className="font-bold">LECTURER'S NAMES: </span>
                        <span className="border-b border-dotted border-gray-500">
                          {header.instructor_name ?? ''}
                        </span>
                      </div>
                      <div>
                        <span className="font-bold">Campus: </span>
                        <span className="border-b border-dotted border-gray-500">
                          {header.campus_name ?? ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ── ATTENDANCE TABLE ── */}
                  <div className="mt-5 font-serif">
                    <div className="font-bold text-[13px] mb-1">EXAM ATTENDANCE LIST</div>
                    <table className="w-full border-collapse text-[11.5px] text-gray-900">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border border-gray-700 px-1.5 py-1.5 w-8 font-bold">No</th>
                          <th className="border border-gray-700 px-1.5 py-1.5 text-left font-bold">FIRST NAME A-Z (Family Name)</th>
                          <th className="border border-gray-700 px-1.5 py-1.5 text-left font-bold">Last Name / Other Name</th>
                          <th className="border border-gray-700 px-1.5 py-1.5 text-left font-bold">Reg Number</th>
                          <th className="border border-gray-700 px-1.5 py-1.5 text-left font-bold">Day or Weekend</th>
                          <th className="border border-gray-700 px-1.5 py-1.5 text-left font-bold">Option</th>
                          <th className="border border-gray-700 px-1.5 py-1.5 text-left font-bold">Semester</th>
                          <th className="border border-gray-700 px-1.5 py-1.5 text-left font-bold w-20">SIGN IN</th>
                          <th className="border border-gray-700 px-1.5 py-1.5 text-left font-bold w-20">SIGN OUT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roster.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="border border-gray-700 px-2 py-6 text-center text-gray-500">
                              No students mapped to this module yet.
                            </td>
                          </tr>
                        ) : (
                          roster.map((r, i) => (
                            <tr key={r.regnumber || i}>
                              <td className="border border-gray-700 px-1.5 py-1 text-center">{i + 1}</td>
                              <td className="border border-gray-700 px-1.5 py-1">{r.first_name}</td>
                              <td className="border border-gray-700 px-1.5 py-1">{r.last_name}</td>
                              <td className="border border-gray-700 px-1.5 py-1">{r.regnumber}</td>
                              <td className="border border-gray-700 px-1.5 py-1">{r.attendance_mode ?? ''}</td>
                              <td className="border border-gray-700 px-1.5 py-1">{r.option_acro ?? ''}</td>
                              <td className="border border-gray-700 px-1.5 py-1">{r.semester ?? ''}</td>
                              <td className="border border-gray-700 px-1.5 py-1"></td>
                              <td className="border border-gray-700 px-1.5 py-1"></td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    {roster.length > 0 && (
                      <div className="text-[11px] text-gray-500 mt-1.5">
                        Total students: {roster.length}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function formatExamDateTime(h: { exam_date: string | null; start_time: string | null; end_time: string | null }) {
  const parts: string[] = []
  if (h.exam_date) parts.push(h.exam_date)
  if (h.start_time && h.end_time) {
    parts.push(`${h.start_time.slice(0, 5)} – ${h.end_time.slice(0, 5)}`)
  } else if (h.start_time) {
    parts.push(h.start_time.slice(0, 5))
  }
  return parts.join('  ·  ')
}

/** Build a self-contained HTML page used by `print()` so the printed
 *  output ignores the rest of the app's stylesheet. */
function buildPrintHtml(
  header: NonNullable<Awaited<ReturnType<typeof academicsMgmtService.examAttendance>>['data']>['header'],
  roster: NonNullable<Awaited<ReturnType<typeof academicsMgmtService.examAttendance>>['data']>['roster'],
) {
  const escape = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
  }[c] as string))
  const dateLabel = formatExamDateTime(header)
  const body = roster.length === 0
    ? `<tr><td colspan="9" style="text-align:center;padding:14px 8px;color:#666">No students mapped to this module yet.</td></tr>`
    : roster.map((r, i) => `
        <tr>
          <td style="text-align:center">${i + 1}</td>
          <td>${escape(r.first_name)}</td>
          <td>${escape(r.last_name)}</td>
          <td>${escape(r.regnumber)}</td>
          <td>${escape(r.attendance_mode ?? '')}</td>
          <td>${escape(r.option_acro ?? '')}</td>
          <td>${escape(r.semester ?? '')}</td>
          <td></td>
          <td></td>
        </tr>`).join('')
  return `
<!doctype html>
<html><head>
  <meta charset="utf-8"/>
  <title>${escape(header.module_code)} — Exam attendance</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', Georgia, serif; color: #111; margin: 18mm 14mm; }
    .head { font-size: 12.5pt; line-height: 1.55; }
    .head .row { display: grid; grid-template-columns: 1fr 220px; gap: 12px; }
    .head .full { grid-column: 1 / -1; }
    .head b { font-weight: 700; }
    .field { border-bottom: 1px dotted #555; min-height: 1em; padding-bottom: 1px; }
    h1 { font-size: 13pt; margin: 18px 0 6px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 11pt; }
    th, td { border: 1px solid #333; padding: 4px 6px; vertical-align: top; }
    th { background: #f1f1f1; text-align: left; font-weight: 700; }
    th.no, td.no { width: 24px; text-align: center; }
    th.sign, td.sign { width: 70px; }
    @page { size: A4; margin: 14mm 12mm; }
  </style>
</head><body>
  <div class="head">
    <div class="full"><b>FACULTY OF ${escape((header.fac_name ?? '').toUpperCase())}</b></div>
    <div class="row">
      <div><b>MODULE TITLE:</b> <span class="field">${escape(header.module_name)}</span></div>
      <div><b>Module Code:</b> <span class="field">${escape(header.module_code)}</span></div>
    </div>
    <div class="row">
      <div><b>COMPONENT:</b> <span class="field">${escape(header.component)}</span></div>
      <div><b>Date:</b> <span class="field">${escape(dateLabel)}</span></div>
    </div>
    <div class="row">
      <div><b>LECTURER'S NAMES:</b> <span class="field">${escape(header.instructor_name ?? '')}</span></div>
      <div><b>Campus:</b> <span class="field">${escape(header.campus_name ?? '')}</span></div>
    </div>
  </div>

  <h1>EXAM ATTENDANCE LIST</h1>
  <table>
    <thead>
      <tr>
        <th class="no">No</th>
        <th>FIRST NAME A-Z (Family Name)</th>
        <th>Last Name / Other Name</th>
        <th>Reg Number</th>
        <th>Day or Weekend</th>
        <th>Option</th>
        <th>Semester</th>
        <th class="sign">SIGN IN</th>
        <th class="sign">SIGN OUT</th>
      </tr>
    </thead>
    <tbody>
      ${body}
    </tbody>
  </table>
</body></html>`
}
