import { useEffect, useState } from 'react'
import { BellRing, BellOff, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  disableDevicePush,
  enableDevicePush,
  getDevicePushState,
  type DevicePushState,
} from '@/services/devicePushService'

/**
 * Footer control in the notification dropdown: turns alerts on for this device
 * so notifications arrive even when the app is closed. Hides itself wherever
 * the browser cannot do Web Push or the server has no key configured.
 */
export default function DeviceAlertsToggle() {
  const [state, setState] = useState<DevicePushState | 'loading'>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getDevicePushState().then(setState).catch(() => setState('unsupported'))
  }, [])

  if (state === 'loading' || state === 'unsupported' || state === 'unconfigured') return null

  async function toggle() {
    setBusy(true)
    try {
      if (state === 'on') {
        await disableDevicePush()
        setState('off')
        toast.success('Device alerts turned off')
        return
      }
      const next = await enableDevicePush()
      setState(next)
      if (next === 'on') toast.success('Device alerts turned on')
      if (next === 'blocked') toast.error('Notifications are blocked for this site in your browser settings')
    } catch {
      toast.error('Could not change device alerts. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'blocked') {
    return (
      <p className="flex items-center gap-2 text-[12px] text-ink-500 dark:text-ink-400">
        <BellOff className="w-3.5 h-3.5 shrink-0" />
        Device alerts are blocked. Allow notifications for this site in your browser settings.
      </p>
    )
  }

  const on = state === 'on'
  return (
    <button
      onClick={toggle}
      disabled={busy}
      className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors disabled:opacity-60 bg-brand/10 text-brand hover:bg-brand/15 dark:bg-brand/25 dark:text-gold-400 dark:hover:bg-brand/35"
    >
      {busy
        ? <Loader2 className="w-4 h-4 animate-spin" />
        : on ? <BellOff className="w-4 h-4" /> : <BellRing className="w-4 h-4" />}
      {on ? 'Device alerts on · turn off' : 'Turn on device alerts'}
    </button>
  )
}
