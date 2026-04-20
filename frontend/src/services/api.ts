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
      
      // If we are not already on the login page, redirect
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)



export const api = {
  get: <T>(url: string, params?: Record<string, unknown>) =>
    apiClient.get<ApiResponse<T>>(url, { params }).then((r) => r.data),

  post: <T>(url: string, body?: unknown) =>
    apiClient.post<ApiResponse<T>>(url, body).then((r) => r.data),

  put: <T>(url: string, body?: unknown) =>
    apiClient.put<ApiResponse<T>>(url, body).then((r) => r.data),

  patch: <T>(url: string, body?: unknown) =>
    apiClient.patch<ApiResponse<T>>(url, body).then((r) => r.data),

  delete: <T>(url: string) =>
    apiClient.delete<ApiResponse<T>>(url).then((r) => r.data),
}
