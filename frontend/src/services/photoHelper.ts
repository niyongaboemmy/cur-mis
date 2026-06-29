const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Strip the cache-buster version suffix appended by detail pages ("-0", "-3", …). */
export const stripPhotoVersion = (s: string) => s.trim().replace(/-\d+$/, '')

/** True when the stored photo value is a file-server UUID. */
export const isPhotoUuid = (v: string) => UUID_RE.test(stripPhotoVersion(v))

const LEGACY_PHOTO_BASE = 'https://cur.ac.rw/mis/main/registraria'

/**
 * Build a direct browser URL for a legacy photo value (non-UUID path).
 * Values like "documents/std_photo/photo_xxx.jpg" or bare "photo_xxx.jpg"
 * are served straight from the old CUR photo store so the browser never
 * routes through the PHP backend.
 */
export const legacyPhotoUrl = (photoValue: string): string => {
  const v = stripPhotoVersion(photoValue)
  if (/^https?:\/\//i.test(v)) return v           // already absolute URL
  const path = v.startsWith('/') ? v.slice(1) : v
  const rel  = path.includes('/') ? path : `documents/std_photo/${path}`
  return `${LEGACY_PHOTO_BASE}/${rel}`
}
