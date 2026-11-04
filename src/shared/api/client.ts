import axios, { type AxiosError } from 'axios'
import type { ApiError } from '../../types/api'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export const api = axios.create({
  baseURL,
  headers: { Accept: 'application/json' },
})

const TOKEN_KEY = 'reservas.accessToken'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

api.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export function parseApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const ax = error as AxiosError<ApiError>
    if (ax.response?.data?.message) {
      return ax.response.data.message
    }
    if (ax.response?.status === 401) {
      return 'Sesión inválida o expirada. Volvé a iniciar sesión.'
    }
    if (ax.response?.status === 403) {
      return 'No tenés permiso para esta acción.'
    }
    if (ax.message) {
      return ax.message
    }
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Ocurrió un error inesperado.'
}
