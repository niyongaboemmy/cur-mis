import { api } from '@/services/api'

/**
 * Device alerts: lets this browser or installed app receive notifications while
 * closed, the same way messaging apps do. Works only in browsers that support
 * Web Push (Chrome, Edge, Brave, Firefox on desktop and Android).
 *
 * Every function here is safe to call on an unsupported browser: it reports
 * 'unsupported' rather than throwing.
 */

export type DevicePushState = 'unsupported' | 'unconfigured' | 'blocked' | 'off' | 'on'

/** Only treat Web Push as available when every browser API we need is there. */
export function isDevicePushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** The worker that handles pushes. Null in dev, where no worker is registered. */
async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  const reg = await navigator.serviceWorker.getRegistration()
  return reg && reg.active ? reg : null
}

function urlBase64ToBytes(base64url: string): ArrayBuffer {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob(padded)
  const buffer = new ArrayBuffer(raw.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return buffer
}

/** Where this device stands right now. */
export async function getDevicePushState(): Promise<DevicePushState> {
  if (!isDevicePushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'

  const reg = await activeRegistration()
  if (!reg) return 'unsupported'

  const sub = await reg.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

/**
 * Ask for permission and subscribe this device. Must run from a user click,
 * because browsers refuse the permission prompt otherwise.
 */
export async function enableDevicePush(): Promise<DevicePushState> {
  if (!isDevicePushSupported()) return 'unsupported'

  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'blocked'
  if (permission !== 'granted') return 'off'

  const config = await api.get<{ enabled: boolean; public_key: string }>('/push/vapid-key', {})
    .then(r => r.data)
  if (!config?.enabled || !config.public_key) return 'unconfigured'

  // The user just clicked, so waiting for a worker still installing on a first visit is fine.
  const reg = await navigator.serviceWorker.ready

  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBytes(config.public_key),
  })

  // Sent with the signed-in user's token, so the subscription belongs to whoever is logged in here.
  await api.post('/push/subscribe', sub.toJSON())
  return 'on'
}

/** Turn device alerts off for this browser and forget it on the server. */
export async function disableDevicePush(): Promise<void> {
  const reg = await activeRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return

  try {
    await api.post('/push/unsubscribe', { endpoint: sub.endpoint })
  } finally {
    await sub.unsubscribe()
  }
}
