import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PenLine, Save, Info, RotateCcw, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { systemService } from '@/services/systemService'
import { PERMISSIONS } from '@/constants/permissions'
import { usePermission } from '@/utils/permissions'

/**
 * Who signs the documents the registry issues.
 *
 * The Academic Registrar's name used to be a string literal in five places
 * across the document helpers, so a change of officeholder needed a code
 * change and a deploy — and until every copy was found, a transcript and a
 * certificate could go out over two different names. It is one setting now,
 * and this is where it is set.
 */
export default function SignatoriesPanel() {
  const qc = useQueryClient()
  const canManage = usePermission(PERMISSIONS.MANAGE_SETTINGS)

  const { data: res, isLoading, isError } = useQuery({
    queryKey: ['system', 'signatories'],
    queryFn:  ({ signal }) => systemService.getSignatories(signal),
  })

  const settings = res?.data?.settings
  const defaults = res?.data?.defaults

  const [name, setName] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!settings) return
    setName(settings.academic_registrar_name ?? '')
    setDirty(false)
  }, [settings])

  const saveMut = useMutation({
    mutationFn: () => systemService.saveSignatories({ academic_registrar_name: name.trim() }),
    onSuccess: () => {
      toast.success('Signatory saved. New documents will carry this name.')
      qc.invalidateQueries({ queryKey: ['system', 'signatories'] })
      setDirty(false)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to save.'),
  })

  const trimmed = name.trim()
  const canSave = canManage && dirty && trimmed !== '' && !saveMut.isPending

  if (isLoading) {
    return (
      <div className="card p-6 flex items-center gap-2 text-[13px] text-ink-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading signatories…
      </div>
    )
  }
  if (isError) {
    return <div className="card p-6 text-[13px] text-rose-600">Could not load signatories.</div>
  }

  return (
    <div className="card p-5 space-y-4 max-w-[640px]">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          <PenLine className="w-4 h-4 text-brand" />
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-ink-900 dark:text-ink-50">Academic Registrar</h2>
          <p className="text-[12.5px] text-ink-500">
            Printed above “Academic Registrar” on transcripts, certificates, admission
            and visa letters, and the completed-modules report.
          </p>
        </div>
      </div>

      <label className="block">
        <span className="block text-[11px] font-semibold uppercase text-ink-400 mb-1">
          Name as it should appear
        </span>
        <input
          className="input w-full"
          value={name}
          maxLength={120}
          disabled={!canManage}
          placeholder={defaults?.academic_registrar_name ?? ''}
          onChange={(e) => { setName(e.target.value); setDirty(true) }}
        />
      </label>

      <div className="flex items-start gap-2 text-[12px] text-ink-500">
        <Info className="w-3.5 h-3.5 mt-px shrink-0 text-sky-500" />
        <span>
          Applies to documents generated from now on. Copies already downloaded or
          printed keep the name they were issued with.
        </span>
      </div>

      {canManage && (
        <div className="flex items-center gap-2">
          <button
            className="btn-primary btn-sm"
            disabled={!canSave}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Save className="w-3.5 h-3.5" />}
            {saveMut.isPending ? 'Saving…' : 'Save'}
          </button>
          {dirty && (
            <button
              className="btn-ghost btn-sm"
              onClick={() => { setName(settings?.academic_registrar_name ?? ''); setDirty(false) }}
            >
              <RotateCcw className="w-3.5 h-3.5" /> Discard
            </button>
          )}
          {trimmed === '' && dirty && (
            <span className="text-[12px] text-amber-600">
              A name is required — every issued document carries this line.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
