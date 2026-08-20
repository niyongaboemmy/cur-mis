import { useEffect, useState } from 'react'
import { Video, Save, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { systemService, type GuidanceVideos } from '@/services/systemService'
import { PERMISSIONS } from '@/constants/permissions'
import { usePermission } from '@/utils/permissions'

/**
 * The two public-facing guidance video URLs.
 *
 * Lifted out of AcademicSettingsPage, where it was an extra tab with no
 * permission filter at all — anyone who could reach Academic settings saw the
 * editor, and their save 403'd against MANAGE_SETTINGS. It now lives on the
 * Settings page that those slugs actually guard, and the form is read-only
 * without the write permission.
 */
export default function GuidanceVideosPanel() {
  const canManage = usePermission(PERMISSIONS.MANAGE_SETTINGS)

  const [vals, setVals]     = useState<GuidanceVideos>({ video_application_guide_url: '', video_login_guide_url: '' })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    systemService.getGuidanceVideos()
      .then((r) => { if (r.data) setVals(r.data) })
      .catch(() => toast.error('Could not load the guidance videos.'))
      .finally(() => setLoaded(true))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const r = await systemService.saveGuidanceVideos(vals)
      if (r.data) setVals(r.data)
      toast.success('Guidance videos saved.')
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not save the guidance videos.')
    } finally {
      setSaving(false)
    }
  }

  const fields: { key: keyof GuidanceVideos; label: string; hint: string }[] = [
    {
      key: 'video_application_guide_url',
      label: 'How to apply video',
      hint: 'Linked from the public application form so candidates can watch the full apply walkthrough, including how to upload the payment slip.',
    },
    {
      key: 'video_login_guide_url',
      label: 'How to log in & reset password video',
      hint: 'Shown below the login form and on the applicant overview so admitted students know how to use their registration number and reset their password.',
    },
  ]

  return (
    <section className="card p-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-4">
        <Video className="w-5 h-5 text-brand" />
        <div>
          <h2 className="section-title">Guidance videos</h2>
          <p className="section-sub">
            URLs shown publicly to applicants. Paste a YouTube link, Vimeo link, or any direct video URL.
          </p>
        </div>
      </div>

      {!loaded ? (
        <p className="text-[12.5px] text-ink-500 py-6">Loading…</p>
      ) : (
        <div className="space-y-4">
          {fields.map(({ key, label, hint }) => (
            <div key={key}>
              <label className="label" htmlFor={`gv-${key}`}>{label}</label>
              <p className="text-[11.5px] text-ink-500 mb-1.5">{hint}</p>
              <input
                id={`gv-${key}`}
                type="url"
                className="input"
                placeholder="https://youtu.be/…"
                readOnly={!canManage}
                value={vals[key]}
                onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))}
              />
              {vals[key] && (
                <a
                  href={vals[key]}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 mt-1 text-[11.5px] text-brand hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> Preview
                </a>
              )}
            </div>
          ))}

          {canManage && (
            <div className="pt-2 flex justify-end">
              <button type="button" onClick={save} disabled={saving} className="btn-primary">
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
