import jsPDF from 'jspdf'
import { graduandService, type ReadyListParams, type ReadyRow } from '@/services/graduandService'

/** Printed at the top of the ceremony list. */
export const INSTITUTION = 'CATHOLIC UNIVERSITY OF RWANDA'

export interface CeremonyMeta {
  /** e.g. "Graduation Ceremony" */
  title:          string
  ceremonyNumber: string
  /** Already formatted for print, e.g. "12 December 2026". */
  date:           string
  /** One line each, describing the filters in force. */
  filters:        string[]
  /** When the completion figures were last computed, or null. */
  computedAt:     string | null
}

/** The roster pages at most 500 rows per request, so walk every page. */
export async function fetchAllReady(params: ReadyListParams): Promise<ReadyRow[]> {
  const out: ReadyRow[] = []
  let page = 1
  for (let guard = 0; guard < 200; guard++) {
    const body = (await graduandService.readyList({ ...params, page, per_page: 500 })).data
    if (!body) break
    out.push(...body.data)
    if (page >= body.last_page) break
    page++
  }
  return out
}

/* ── Layout ─────────────────────────────────────────────────────────────── */

const M = 40                 // page margin, pt
const USABLE = 515           // A4 portrait width minus both margins
const ROW_H = 13
const FOOTER_H = 56          // space kept free at the foot of each page

const COLS = [
  { label: '#',          x: M,       w: 26 },
  { label: 'Reg number', x: M + 30,  w: 100 },
  { label: 'Name',       x: M + 134, w: 230 },
  { label: 'Class',      x: M + 368, w: 105 },
  { label: 'Average',    x: M + 478, w: 37 },
]

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Department → programme → students, each level sorted for reading. */
function groupRows(rows: ReadyRow[]) {
  const byDept = new Map<string, Map<string, ReadyRow[]>>()
  for (const r of rows) {
    const dept = r.dep_name?.trim() || 'Unassigned department'
    const prog = (r.option_name ?? r.option_acronym ?? '').trim() || 'Unassigned programme'
    if (!byDept.has(dept)) byDept.set(dept, new Map())
    const progs = byDept.get(dept)!
    if (!progs.has(prog)) progs.set(prog, [])
    progs.get(prog)!.push(r)
  }
  const sortedDepts = [...byDept.keys()].sort((a, b) => a.localeCompare(b))
  return sortedDepts.map((dept) => {
    const progs = byDept.get(dept)!
    const sortedProgs = [...progs.keys()].sort((a, b) => a.localeCompare(b))
    return {
      dept,
      programmes: sortedProgs.map((prog) => ({
        prog,
        students: progs.get(prog)!.sort((a, b) =>
          (a.lname ?? '').localeCompare(b.lname ?? '') || (a.fname ?? '').localeCompare(b.fname ?? '')),
      })),
    }
  })
}

/**
 * The ceremony list: a printable, paginated PDF of every student in `rows`,
 * grouped by department and programme, with per-programme totals, a grand
 * total and a sign-off block. Returns the document; the caller saves it.
 */
export function buildCeremonyPdf(rows: ReadyRow[], meta: CeremonyMeta): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const bottom = pageH - FOOTER_H
  let y = M
  let usesSuggested = false

  const newPage = () => { doc.addPage(); y = M }

  const drawColumnHeader = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(80)
    COLS.forEach((c) => doc.text(c.label, c.x, y))
    doc.setTextColor(0)
    y += 4
    doc.setDrawColor(170); doc.line(M, y, M + USABLE, y); y += 10
    doc.setFont('helvetica', 'normal')
  }

  /** Makes room for `need` pt, starting a fresh page (and its headers) if needed. */
  const ensure = (need: number, redraw?: () => void) => {
    if (y + need > bottom) { newPage(); redraw?.() }
  }

  // ── Title block (first page) ──────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
  doc.text(INSTITUTION, pageW / 2, y, { align: 'center' }); y += 18
  doc.setFontSize(14)
  doc.text(meta.title.toUpperCase(), pageW / 2, y, { align: 'center' }); y += 18

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  const ceremonyLine = [
    meta.ceremonyNumber ? `Ceremony ${meta.ceremonyNumber}` : '',
    meta.date,
  ].filter(Boolean).join('   ·   ')
  if (ceremonyLine) { doc.text(ceremonyLine, pageW / 2, y, { align: 'center' }); y += 13 }

  doc.setFontSize(8); doc.setTextColor(90)
  for (const line of doc.splitTextToSize(meta.filters.join('   ·   '), USABLE)) {
    doc.text(line, pageW / 2, y, { align: 'center' }); y += 11
  }
  doc.setTextColor(0)
  y += 6
  doc.setDrawColor(150); doc.line(M, y, M + USABLE, y); y += 16

  // ── Body: department → programme → students ───────────────────────────────
  for (const group of groupRows(rows)) {
    ensure(40)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text(group.dept.toUpperCase(), M, y); y += 15

    for (const { prog, students } of group.programmes) {
      ensure(60)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
      doc.text(`Programme: ${prog}`, M, y)
      doc.text(plural(students.length, 'graduand', 'graduands'), M + USABLE, y, { align: 'right' })
      y += 12
      drawColumnHeader()

      students.forEach((r, i) => {
        // Re-draw the column headings if a programme runs onto a new page.
        ensure(ROW_H, drawColumnHeader)

        if (i % 2 === 1) {
          doc.setFillColor(244, 246, 249)
          doc.rect(M, y - 9, USABLE, ROW_H, 'F')
        }

        const cls = r.degree_class ?? r.suggested_class
        if (!r.degree_class && r.suggested_class) usesSuggested = true
        const classText = cls ? (r.degree_class ? cls : `${cls} *`) : '—'
        const name = `${(r.lname ?? '').toUpperCase()} ${r.fname ?? ''}`.trim()
        const avg  = r.weighted_avg != null ? `${Number(r.weighted_avg).toFixed(1)}%` : '—'

        const cells = [String(i + 1), r.regnumber ?? '', name, classText, avg]
        COLS.forEach((c, idx) => {
          // jsPDF does not wrap: clip each cell to its column.
          doc.text(doc.splitTextToSize(cells[idx], c.w)[0] ?? '', c.x, y)
        })
        y += ROW_H
      })

      ensure(20)
      y += 3
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
      doc.text(`Total for ${prog}: ${students.length}`, M + USABLE, y, { align: 'right' })
      y += 18
    }
    y += 4
  }

  // ── Grand total, footnote and sign-off ────────────────────────────────────
  ensure(150)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text(`Total graduands: ${rows.length}`, M, y); y += 18

  if (usesSuggested) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text('* Suggested class from the regulations; not yet confirmed by the registry.', M, y)
    y += 16
  }

  const signatories = ['Prepared by (Registry)', 'Checked by (Academic Registrar)', 'Approved by (Vice-Rector / Senate)']
  const slot = USABLE / signatories.length
  y += 24
  signatories.forEach((label, i) => {
    const x = M + i * slot
    doc.setDrawColor(0); doc.line(x + 8, y + 26, x + slot - 16, y + 26)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(label, x + 8, y + 38)
    doc.text('Name, signature, date', x + 8, y + 48)
  })

  // ── Footers, once the page count is known ─────────────────────────────────
  const total = doc.getNumberOfPages()
  const generated = `Generated ${new Date().toLocaleString('en-GB')}`
    + (meta.computedAt ? `   ·   Figures computed ${meta.computedAt}` : '')
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120)
    doc.text(generated, M, pageH - 28)
    doc.text(`Page ${p} of ${total}`, M + USABLE, pageH - 28, { align: 'right' })
    doc.setTextColor(0)
  }

  return doc
}
