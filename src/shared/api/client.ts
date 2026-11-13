import axios, { type AxiosError } from 'axios'
import type { ApiError } from '../../types/api'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export const api = axios.create({
  baseURL,
  headers: { Accept: 'application/json' },
  // Sin respuesta en 20 s se considera caído el backend (se muestra la página 500).
  timeout: 20000,
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

/** Eventos globales que la UI escucha (ver ApiEventsBridge). */
export const AUTH_EXPIRED_EVENT = 'reservas:auth-expired'
export const SERVER_ERROR_EVENT = 'reservas:server-error'

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const url = error.config?.url ?? ''
      const method = (error.config?.method ?? 'get').toLowerCase()
      if (status === 401 && !url.startsWith('/auth/login') && getStoredToken()) {
        // Token vencido o inválido: se cierra la sesión y se vuelve al login.
        setStoredToken(null)
        window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
      } else if ((status === undefined || status >= 500) && method === 'get') {
        // Gateway o microservicio caído al cargar datos: pantalla 500 amigable.
        window.dispatchEvent(
          new CustomEvent(SERVER_ERROR_EVENT, { detail: { status: status ?? 503 } }),
        )
      }
    }
    return Promise.reject(error)
  },
)

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
    if (ax.response?.status === 404) {
      return 'El recurso solicitado no existe.'
    }
    if (!ax.response || ax.response.status >= 500) {
      return 'El servidor no está disponible en este momento. Probá de nuevo en unos segundos.'
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
