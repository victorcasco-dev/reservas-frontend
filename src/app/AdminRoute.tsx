import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

export function AdminRoute() {
  const { isAdministrator } = useAuth()
  if (!isAdministrator) {
    return <Navigate to="/availability" replace />
  }
  return <Outlet />
}
