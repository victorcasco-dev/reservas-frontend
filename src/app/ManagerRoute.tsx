import { Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { ForbiddenPage } from '../features/errors/ErrorPage'

/** Rutas para profesor o administrador (el alumno ve una página 403). */
export function ManagerRoute() {
  const { canManageAvailability } = useAuth()
  if (!canManageAvailability) {
    return <ForbiddenPage />
  }
  return <Outlet />
}
