/** App-wide constants. Import from '@/constants' */

export const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'CUR-MIS'

/** Local-storage key used by Zustand auth persist middleware */
export const AUTH_STORAGE_KEY = import.meta.env.VITE_AUTH_STORAGE_KEY ?? 'cur-mis-auth'

/** Default number of rows per page in data tables */
export const DEFAULT_PAGE_SIZE = 15

/** Available per-page options for data tables */
export const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100]

/** API query-stale time in milliseconds (5 minutes) */
export const QUERY_STALE_TIME = 1000 * 60 * 5

/** Request timeout for Axios (ms) */
export const API_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT ?? 15_000)

/** Supported date display format (Intl) */
export const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric', month: 'short', day: 'numeric',
}

export const DATETIME_FORMAT: Intl.DateTimeFormatOptions = {
  ...DATE_FORMAT, hour: '2-digit', minute: '2-digit',
}

/** HTTP status codes used throughout the app */
export const HTTP = {
  OK:                  200,
  CREATED:             201,
  NO_CONTENT:          204,
  BAD_REQUEST:         400,
  UNAUTHORIZED:        401,
  FORBIDDEN:           403,
  NOT_FOUND:           404,
  UNPROCESSABLE:       422,
  TOO_MANY_REQUESTS:   429,
  SERVER_ERROR:        500,
} as const

export * from './permissions'
