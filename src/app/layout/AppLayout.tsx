import { NavLink, Outlet } from 'react-router-dom'
import { Bell, CalendarDays, ClipboardList, LogOut, Tags, Users } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { formatRoles } from '../../shared/roleLabels'

export function AppLayout() {
  const { user, logout, isAdministrator } = useAuth()

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-mark" aria-hidden />
          <div>
            <strong>Reservas</strong>
            <span>Tutorías</span>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Principal">
          <NavLink to="/availability" className={({ isActive }) => (isActive ? 'active' : '')}>
            <CalendarDays size={18} strokeWidth={2} aria-hidden />
            Disponibilidad
          </NavLink>
          <NavLink to="/reservations" className={({ isActive }) => (isActive ? 'active' : '')}>
            <ClipboardList size={18} strokeWidth={2} aria-hidden />
            Reservas
          </NavLink>
          {isAdministrator && (
            <>
              <NavLink to="/notifications" className={({ isActive }) => (isActive ? 'active' : '')}>
                <Bell size={18} strokeWidth={2} aria-hidden />
                Notificaciones
              </NavLink>
              <NavLink to="/consultation-types" className={({ isActive }) => (isActive ? 'active' : '')}>
                <Tags size={18} strokeWidth={2} aria-hidden />
                Tipos de consulta
              </NavLink>
              <NavLink to="/users" className={({ isActive }) => (isActive ? 'active' : '')}>
                <Users size={18} strokeWidth={2} aria-hidden />
                Usuarios
              </NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <span className="user-chip-email">{user?.email}</span>
            <span className="user-chip-roles">
              {user ? formatRoles(user.roles) : ''}
            </span>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
            <LogOut size={16} aria-hidden />
            Salir
          </button>
        </div>
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
