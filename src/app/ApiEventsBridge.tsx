import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AUTH_EXPIRED_EVENT, SERVER_ERROR_EVENT } from '../shared/api/client'
import { useAuth } from '../features/auth/AuthContext'

/**
 * Traduce los eventos del interceptor HTTP en navegación:
 * 401 -> login (sesión vencida), 5xx / sin respuesta en una carga -> página 500.
 */
export function ApiEventsBridge() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()

  useEffect(() => {
    function onExpired() {
      logout()
      toast.error('Tu sesión expiró. Iniciá sesión de nuevo.')
      navigate('/login', { replace: true, state: { from: location.pathname } })
    }
    function onServerError(event: Event) {
      if (location.pathname === '/error') return
      const status = (event as CustomEvent<{ status: number }>).detail?.status ?? 500
      navigate('/error', { state: { status, from: location.pathname } })
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    window.addEventListener(SERVER_ERROR_EVENT, onServerError)
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
      window.removeEventListener(SERVER_ERROR_EVENT, onServerError)
    }
  }, [location.pathname, logout, navigate])

  return null
}
