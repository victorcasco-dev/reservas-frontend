import { NavLink, Outlet } from 'react-router-dom'
import { Bell, BookOpen, CalendarDays, ClipboardList, LogOut, Tags, Users } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'
import { formatRoles } from '../../shared/roleLabels'
import { UiNodeBadge } from '../../shared/ui/UiNodeBadge'

export function AppLayout() {
  const { user, logout, isAdministrator, canManageAvailability } = useAuth()
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email

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
          {canManageAvailability && (
            <NavLink to="/research-lines" className={({ isActive }) => (isActive ? 'active' : '')}>
              <BookOpen size={18} strokeWidth={2} aria-hidden />
              Líneas de investigación
            </NavLink>
          )}
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
          <UiNodeBadge />
          <div className="user-chip" title={user?.email}>
            <span className="user-chip-email">{displayName}</span>
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
