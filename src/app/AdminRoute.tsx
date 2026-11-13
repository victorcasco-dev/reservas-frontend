import { Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { ForbiddenPage } from '../features/errors/ErrorPage'

/** Rutas solo para ADMINISTRATOR: otro perfil ve una página 403 amigable. */
export function AdminRoute() {
  const { isAdministrator } = useAuth()
  if (!isAdministrator) {
    return <ForbiddenPage />
  }
  return <Outlet />
}
