// ── Class name helper ─────────────────────────────────────────────────────────

/** Merge class names, filtering falsy values. */
export function cn(...classes: (string | undefined | null | boolean)[]): string {
  return classes.filter(Boolean).join(' ')
}

// ── Date / time ───────────────────────────────────────────────────────────────

export function formatDate(date: string | Date, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

/** Returns "2 hours ago", "3 days ago", etc. */
export function timeAgo(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  const units: [number, string][] = [
    [31_536_000, 'year'],
    [2_592_000,  'month'],
    [604_800,    'week'],
    [86_400,     'day'],
    [3_600,      'hour'],
    [60,         'minute'],
    [1,          'second'],
  ]
  for (const [secs, unit] of units) {
    const n = Math.floor(seconds / secs)
    if (n >= 1) return `${n} ${unit}${n !== 1 ? 's' : ''} ago`
  }
  return 'just now'
}

// ── Numbers ───────────────────────────────────────────────────────────────────

/** Format a number with locale-aware thousands separators. */
export function formatNumber(n: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(n)
}

/** Format a currency value. */
export function formatCurrency(amount: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
}

/** Compact formatting: 1_200 → "1.2K", 1_500_000 → "1.5M". */
export function formatCompact(n: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

// ── Strings ───────────────────────────────────────────────────────────────────

export function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max) + '…'
}

/** "john doe" → "John Doe" */
export function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** "firstName" → "First Name" */
export function camelToWords(str: string): string {
  return titleCase(str.replace(/([A-Z])/g, ' $1').trim())
}

/** Return the initials of a name (up to 2 letters). "Alice Doe" → "AD" */
export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

// ── Object / array ────────────────────────────────────────────────────────────

/** Omit keys from an object. */
export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj }
  keys.forEach((k) => delete result[k])
  return result
}

/** Pick keys from an object. */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((k) => [k, obj[k]])) as Pick<T, K>
}

/** Group an array by a key function. */
export function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyFn(item)
    ;(acc[key] ??= []).push(item)
    return acc
  }, {})
}

// ── Async / timing ────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Returns a debounced version of `fn`. */
export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

// ── Error handling ────────────────────────────────────────────────────────────

/** Extract a human-readable message from any error shape. */
export function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const axiosMsg = (error as { response?: { data?: { message?: string } } })
      ?.response?.data?.message
    if (axiosMsg) return axiosMsg

    const msg = (error as { message?: string }).message
    if (msg) return msg
  }
  return 'An unexpected error occurred.'
}

/** Extract field-level validation errors from a 422 response. */
export function getFieldErrors(error: unknown): Record<string, string> {
  const errors = (error as { response?: { data?: { errors?: Record<string, string[]> } } })
    ?.response?.data?.errors
  if (!errors) return {}
  return Object.fromEntries(
    Object.entries(errors).map(([field, msgs]) => [field, msgs[0] ?? ''])
  )
}

// ── URL helpers ───────────────────────────────────────────────────────────────

/** Build a URL query string from a params object, skipping null/undefined. */
export function buildQueryString(params: Record<string, unknown>): string {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') q.set(k, String(v))
  })
  const str = q.toString()
  return str ? `?${str}` : ''
}
