/**
 * Build a URL for a file served from `public/`, respecting VITE_BASE_PATH.
 *
 * Both sides are normalised because a naive `${base}/${file}` breaks badly at
 * the edges. With VITE_BASE_PATH="/" (the local default) it produced
 * "//logo.png", which is a protocol-relative URL: the browser reads "logo.png"
 * as a HOSTNAME and the request fails with ERR_NAME_NOT_RESOLVED rather than
 * 404, so the crest silently disappeared on every page that renders it.
 *
 *   ""       + "logo.png"  ->  /logo.png
 *   "/"      + "logo.png"  ->  /logo.png
 *   "/umis"  + "logo.png"  ->  /umis/logo.png
 *   "/umis/" + "/logo.png" ->  /umis/logo.png
 */
const base = (import.meta.env.VITE_BASE_PATH ?? '').replace(/\/+$/, '')

export const asset = (file: string) => `${base}/${file.replace(/^\/+/, '')}`
