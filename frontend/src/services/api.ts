import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/store/authStore'
import { API_TIMEOUT } from '@/constants'
import { ApiResponse } from '@/types'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  },
  timeout: API_TIMEOUT,
})

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const isAuthPath = error.config?.url?.includes('/auth/login') || 
                       error.config?.url?.includes('/auth/verify-otp') ||
                       error.config?.url?.includes('/auth/verify-reset-otp') ||
                       error.config?.url?.includes('/auth/me'); // Don't reload on first /me failure

    if (error.response?.status === 401 && !isAuthPath) {
      // Only clear and reload if we are truly unauthenticated on a protected route
      useAuthStore.getState().logout()
      
      // Build the login path respecting the subfolder base (e.g. /umsTest/login)
      const base      = (import.meta.env.VITE_BASE_PATH ?? '').replace(/\/$/, '')
      const loginPath = `${base}/login`
      if (!window.location.pathname.startsWith(loginPath)) {
        window.location.href = loginPath
      }
    }
    return Promise.reject(error)
  },
)



export const api = {
  get: <T>(url: string, params?: Record<string, unknown>, signal?: AbortSignal) =>
    apiClient.get<ApiResponse<T>>(url, { params, signal }).then((r) => r.data),

  post: <T>(url: string, body?: unknown, signal?: AbortSignal) =>
    apiClient.post<ApiResponse<T>>(url, body, { signal }).then((r) => r.data),

  put: <T>(url: string, body?: unknown, signal?: AbortSignal) =>
    apiClient.put<ApiResponse<T>>(url, body, { signal }).then((r) => r.data),

  patch: <T>(url: string, body?: unknown, signal?: AbortSignal) =>
    apiClient.patch<ApiResponse<T>>(url, body, { signal }).then((r) => r.data),

  delete: <T>(url: string, signal?: AbortSignal) =>
    apiClient.delete<ApiResponse<T>>(url, { signal }).then((r) => r.data),

  /** Multipart POST — pass a FormData body. Axios sets the correct
   *  `multipart/form-data` boundary automatically when we leave Content-Type
   *  unset here (overrides the client default of application/json). */
  upload: <T>(url: string, form: FormData, signal?: AbortSignal) =>
    apiClient
      .post<ApiResponse<T>>(url, form, {
        signal,
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),
};
