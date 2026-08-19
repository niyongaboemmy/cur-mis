import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Circle,
  Download,
  FileSpreadsheet,
  Lock,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import {
  studentService,
  type ExportColumn,
  type ExportColumnGroup,
  type ExportTemplate,
} from '@/services/studentService'
import toast from 'react-hot-toast'

interface StudentExportModalProps {
  open: boolean
  onClose: () => void
  /** Total students that will be in the export (matches the live list). */
  totalRecords: number
  /** All filter values currently driving the visible list — forwarded
   *  to the export endpoint so the CSV matches exactly what the user
   *  sees. */
  filters: Record<string, string | number | undefined>
}

type Tab = 'templates' | 'custom'

export default function StudentExportModal({
  open,
  onClose,
  totalRecords,
  filters,
}: StudentExportModalProps) {
  const qc = useQueryClient()

  // ── Server data ──────────────────────────────────────────────
  const columnsQ = useQuery({
    queryKey: ['students', 'export-columns'],
    queryFn:  () => studentService.exportColumns(),
    enabled:  open,
    staleTime: 60 * 60_000,
  })
  const templatesQ = useQuery({
    queryKey: ['students', 'export-templates'],
    queryFn:  () => studentService.listExportTemplates(),
    enabled:  open,
    staleTime: 60_000,
  })

  const groups: ExportColumnGroup[] = columnsQ.data?.data?.groups ?? []
  const templates: ExportTemplate[] = templatesQ.data?.data?.templates ?? []

  // Flat lookup: column key → metadata. Lets us render the chip strip
  // for the active selection without re-walking the grouped tree.
  const columnByKey: Record<string, ExportColumn> = useMemo(() => {
    const out: Record<string, ExportColumn> = {}
    for (const g of groups) for (const c of g.columns) out[c.key] = c
    return out
  }, [groups])

  // ── Local state ─────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('templates')
  // The currently selected built-in / saved template (drives the CSV
  // when present — preserves the template's header overrides).
  const [activeTemplateId, setActiveTemplateId] = useState<string | number | null>(null)
  // The custom column selection — used when no template is active.
  // Keyed by column key for O(1) toggles, but rendered in the order
  // the user clicked (so we can persist that order in a saved template).
  const [pickedOrder, setPickedOrder] = useState<string[]>([])
  const pickedSet = useMemo(() => new Set(pickedOrder), [pickedOrder])
  const [search, setSearch] = useState('')
  const [newTemplateName, setNewTemplateName] = useState('')

  // Reset to a clean slate every time the modal opens so the next user
  // doesn't see stale picks from a previous session.
  useEffect(() => {
    if (!open) return
    setTab('templates')
    setActiveTemplateId(null)
    setPickedOrder([])
    setSearch('')
    setNewTemplateName('')
  }, [open])

  // Preselect the first system template (HLI → Mifotra) as soon as
  // template data lands. Saves a click for the most common workflow.
  useEffect(() => {
    if (!open || activeTemplateId !== null) return
    const systemFirst = templates.find((t) => t.is_system)
    if (systemFirst) setActiveTemplateId(systemFirst.id)
  }, [open, templates, activeTemplateId])

  const togglePick = (key: string) => {
    setPickedOrder((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }
  const clearPicks = () => setPickedOrder([])
  const pickAllInGroup = (group: ExportColumnGroup) => {
    setPickedOrder((prev) => {
      const next = [...prev]
      for (const c of group.columns) if (!next.includes(c.key)) next.push(c.key)
      return next
    })
  }

  /**
   * Pull the column keys out of a template descriptor. Backend stores
   * either bare strings or `{key, label}` objects so we normalise here
   * before pushing them into the custom picker.
   */
  const templateColumnKeys = (tpl: ExportTemplate): string[] =>
    tpl.columns
      .map((c) => (typeof c === 'string' ? c : c.key))
      .filter((k) => !!k && !k.startsWith('__')) // skip synthetic keys

  const onUseTemplate = (tpl: ExportTemplate) => {
    setActiveTemplateId(tpl.id)
    setTab('templates')
  }

  const onEditTemplate = (tpl: ExportTemplate) => {
    setPickedOrder(templateColumnKeys(tpl))
    setActiveTemplateId(null)
    setNewTemplateName(tpl.is_system ? '' : tpl.name)
    setTab('custom')
  }

  // ── Mutations ───────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: () =>
      studentService.saveExportTemplate(newTemplateName.trim(), pickedOrder),
    onSuccess: () => {
      toast.success('Template saved.')
      setNewTemplateName('')
      qc.invalidateQueries({ queryKey: ['students', 'export-templates'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save template.'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number | string) => studentService.deleteExportTemplate(id),
    onSuccess: (_d, id) => {
      toast.success('Template deleted.')
      if (activeTemplateId === id) setActiveTemplateId(null)
      qc.invalidateQueries({ queryKey: ['students', 'export-templates'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Could not delete template.'),
  })

  // ── Export action ───────────────────────────────────────────
  // When a template is active we hand its id to the backend so its
  // own column order + header overrides are honoured. Otherwise we
  // ship the raw picked list and the backend uses canonical labels.
  const canExport =
    tab === 'templates' ? activeTemplateId != null : pickedOrder.length > 0

  const onExport = () => {
    if (!canExport) return
    const url =
      tab === 'templates' && activeTemplateId != null
        ? studentService.exportUrl({ template_id: activeTemplateId, filters })
        : studentService.exportUrl({ columns: pickedOrder, filters })
    // A plain anchor click triggers the browser's native download
    // flow, including the Content-Disposition filename from the
    // server — much cleaner than a fetch-and-blob round-trip.
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    toast.success(`Exporting ${totalRecords.toLocaleString()} student${totalRecords === 1 ? '' : 's'}…`)
    onClose()
  }

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        columns: g.columns.filter(
          (c) =>
            c.label.toLowerCase().includes(q) ||
            c.key.toLowerCase().includes(q) ||
            c.group.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.columns.length > 0)
  }, [groups, search])

  const activeTemplate = templates.find((t) => t.id === activeTemplateId)

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Export students"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12.5px] text-ink-500">
            Exporting{' '}
            <strong className="text-ink-900 dark:text-ink-100">
              {totalRecords.toLocaleString()}
            </strong>{' '}
            student{totalRecords === 1 ? '' : 's'} matching current filters
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={!canExport || totalRecords === 0}
              className="btn-primary flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Download CSV
            </button>
          </div>
        </div>
      }
    >
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-ink-100 dark:border-ink-700 mb-4">
        <TabButton
          active={tab === 'templates'}
          onClick={() => setTab('templates')}
          icon={Sparkles}
          label="Templates"
          count={templates.length}
        />
        <TabButton
          active={tab === 'custom'}
          onClick={() => setTab('custom')}
          icon={FileSpreadsheet}
          label="Custom columns"
          count={pickedOrder.length}
        />
      </div>

      {/* ── Templates tab ─────────────────────────────────────── */}
      {tab === 'templates' && (
        <div className="space-y-2">
          {templatesQ.isLoading && (
            <p className="text-[12.5px] text-ink-400">Loading templates…</p>
          )}
          {!templatesQ.isLoading && templates.length === 0 && (
            <EmptyState
              title="No templates yet"
              hint="Build a column set in the “Custom columns” tab and save it as a template — it'll show up here next time."
            />
          )}
          {templates.map((tpl) => {
            const isActive = tpl.id === activeTemplateId
            const colCount = tpl.columns.length
            return (
              <button
                key={String(tpl.id)}
                type="button"
                onClick={() => onUseTemplate(tpl)}
                className={
                  'w-full text-left p-3.5 rounded-lg border transition-all flex items-start gap-3 ' +
                  (isActive
                    ? 'border-primary-300 bg-primary-50/60 dark:bg-primary-900/20 dark:border-primary-700 shadow-sm'
                    : 'border-ink-100 dark:border-ink-700 hover:border-ink-200 dark:hover:border-ink-600 hover:bg-ink-50/60 dark:hover:bg-ink-800/40')
                }
              >
                <span
                  className={
                    'w-9 h-9 rounded-md flex items-center justify-center shrink-0 ' +
                    (isActive
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
                      : 'bg-ink-100 text-ink-500 dark:bg-ink-700 dark:text-ink-300')
                  }
                >
                  {tpl.is_system ? (
                    <Lock className="w-4 h-4" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-ink-900 dark:text-white text-[14px] truncate">
                      {tpl.name}
                    </span>
                    {tpl.is_system && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded">
                        Built-in
                      </span>
                    )}
                  </span>
                  <span className="block text-[12px] text-ink-500 mt-0.5">
                    {colCount} column{colCount === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditTemplate(tpl)
                    }}
                    className="icon-btn text-ink-500 hover:text-ink-900 dark:hover:text-white"
                    title="Customize columns from this template"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  </button>
                  {!tpl.is_system && tpl.is_owner && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete template "${tpl.name}"?`)) {
                          deleteMut.mutate(tpl.id)
                        }
                      }}
                      className="icon-btn text-ink-400 hover:text-red-600"
                      title="Delete template"
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isActive && (
                    <CheckCircle2 className="w-4 h-4 text-primary-700 dark:text-primary-300 ml-1" />
                  )}
                </span>
              </button>
            )
          })}

          {activeTemplate && activeTemplate.columns.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-ink-50/70 dark:bg-ink-800/50 border border-ink-100 dark:border-ink-700">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-1.5">
                Columns in this template
              </p>
              <div className="flex flex-wrap gap-1.5">
                {activeTemplate.columns.map((c, i) => {
                  const label = typeof c === 'string'
                    ? (columnByKey[c]?.label ?? c)
                    : (c.label || columnByKey[c.key]?.label || c.key)
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center px-2 py-0.5 text-[11.5px] rounded bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 text-ink-700 dark:text-ink-200"
                    >
                      {label.trim()}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Custom tab ────────────────────────────────────────── */}
      {tab === 'custom' && (
        <div className="space-y-4">
          {/* Picked chips */}
          <div className="p-3 rounded-lg bg-ink-50/70 dark:bg-ink-800/50 border border-ink-100 dark:border-ink-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-500">
                Selected · {pickedOrder.length}
              </p>
              {pickedOrder.length > 0 && (
                <button
                  type="button"
                  onClick={clearPicks}
                  className="text-[11.5px] text-ink-500 hover:text-red-600 font-medium"
                >
                  Clear all
                </button>
              )}
            </div>
            {pickedOrder.length === 0 ? (
              <p className="text-[12px] text-ink-400">
                Tick columns below to start building your export.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {pickedOrder.map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11.5px] rounded bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 border border-primary-200 dark:border-primary-800"
                  >
                    {columnByKey[k]?.label ?? k}
                    <button
                      type="button"
                      onClick={() => togglePick(k)}
                      className="hover:text-red-600 ml-0.5"
                      aria-label={`Remove ${k}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search columns…"
              className="input pl-9"
            />
          </div>

          {/* Grouped column picker */}
          <div className="space-y-3 max-h-[42vh] overflow-y-auto pr-1">
            {columnsQ.isLoading && (
              <p className="text-[12.5px] text-ink-400">Loading columns…</p>
            )}
            {filteredGroups.map((g) => (
              <div
                key={g.name}
                className="border border-ink-100 dark:border-ink-700 rounded-lg overflow-hidden"
              >
                <div className="flex items-center justify-between px-3 py-2 bg-ink-50/70 dark:bg-ink-800/40">
                  <h4 className="text-[11.5px] uppercase tracking-wider font-bold text-ink-500">
                    {g.name}
                  </h4>
                  <button
                    type="button"
                    onClick={() => pickAllInGroup(g)}
                    className="text-[11px] text-primary-700 dark:text-primary-300 hover:underline font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add all
                  </button>
                </div>
                <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {g.columns.map((col) => {
                    const checked = pickedSet.has(col.key)
                    return (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() => togglePick(col.key)}
                        className={
                          'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] text-left transition-colors ' +
                          (checked
                            ? 'bg-primary-50/70 dark:bg-primary-900/20 text-primary-800 dark:text-primary-200'
                            : 'hover:bg-ink-50 dark:hover:bg-ink-700/40 text-ink-700 dark:text-ink-200')
                        }
                      >
                        {checked ? (
                          <CheckCircle2 className="w-4 h-4 text-primary-700 dark:text-primary-300 shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-ink-300 shrink-0" />
                        )}
                        <span className="truncate">{col.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Save as template */}
          {pickedOrder.length > 0 && (
            <div className="border border-ink-100 dark:border-ink-700 rounded-lg p-3 bg-ink-50/40 dark:bg-ink-800/30">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-2">
                Save as template
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g. Finance summary"
                  className="input flex-1"
                  maxLength={120}
                />
                <button
                  type="button"
                  onClick={() => saveMut.mutate()}
                  disabled={!newTemplateName.trim() || saveMut.isPending}
                  className="btn-secondary flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saveMut.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
              <p className="text-[11.5px] text-ink-400 mt-1.5">
                Re-saving with the same name updates that template in place.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Sparkles
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-2 px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ' +
        (active
          ? 'border-primary-700 text-primary-700 dark:text-primary-300 dark:border-primary-400'
          : 'border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-100')
      }
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {count != null && count > 0 && (
        <span
          className={
            'text-[10.5px] px-1.5 py-0.5 rounded font-semibold ' +
            (active
              ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200'
              : 'bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-300')
          }
        >
          {count}
        </span>
      )}
    </button>
  )
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="text-center py-10 text-ink-500">
      <FileSpreadsheet className="w-8 h-8 mx-auto text-ink-300 mb-2" />
      <p className="text-[13.5px] font-medium text-ink-700 dark:text-ink-200">
        {title}
      </p>
      <p className="text-[12px] text-ink-400 max-w-sm mx-auto mt-1">{hint}</p>
    </div>
  )
}
