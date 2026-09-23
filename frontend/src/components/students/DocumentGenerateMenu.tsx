import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { DOCUMENT_TYPES } from '@/constants/documentTypes'

interface Props {
  studentId: number
  anchorRect: DOMRect
  onClose: () => void
}

export default function DocumentGenerateMenu({ studentId, anchorRect, onClose }: Props) {
  const popRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const top = anchorRect.bottom + 6 + window.scrollY
  const left = Math.min(anchorRect.left + window.scrollX, window.innerWidth - 320)

  // Group documents by category
  const groupedDocs = DOCUMENT_TYPES.reduce(
    (acc, doc) => {
      if (!acc[doc.group]) acc[doc.group] = []
      acc[doc.group].push(doc)
      return acc
    },
    {} as Record<string, typeof DOCUMENT_TYPES>
  )

  const getDocumentUrl = (slug: string, fileName: string): string => {
    const url = new URL('https://cur.ac.rw/umis/documents/all_certificate/generate_document.php')
    url.searchParams.set('type', slug)
    url.searchParams.set('student_id', String(studentId))
    url.searchParams.set('file_name', fileName)
    return url.toString()
  }

  return createPortal(
    <div
      ref={popRef}
      style={{ position: 'absolute', top, left }}
      className="z-50 w-72 rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 shadow-xl max-h-96 overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
      role="menu"
    >
      {Object.entries(groupedDocs).map(([group, docs], groupIdx) => (
        <div key={group}>
          {groupIdx > 0 && <div className="border-t border-ink-100 dark:border-ink-800" />}
          <p className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">
            {group}
          </p>
          {docs.map((doc) => (
            <a
              key={doc.slug}
              href={getDocumentUrl(doc.slug, doc.fileName)}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              className="block w-full px-3 py-2 text-[13px] text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-800/60 transition-colors text-left"
              onClick={() => onClose()}
            >
              {doc.label}
            </a>
          ))}
        </div>
      ))}
    </div>,
    document.body
  )
}
