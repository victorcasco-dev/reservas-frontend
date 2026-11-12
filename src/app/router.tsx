import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { LoginPage } from '../features/auth/LoginPage'
import { AvailabilityPage } from '../features/availability/AvailabilityPage'
import { UsersPage } from '../features/users/UsersPage'
import { ReservationsPage } from '../features/reservations/ReservationsPage'
import { NotificationsPage } from '../features/notifications/NotificationsPage'
import { ContactPage } from '../features/contact/ContactPage'
import { ProtectedRoute } from './ProtectedRoute'
import { AdminRoute } from './AdminRoute'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/availability" replace />} />
          <Route path="availability" element={<AvailabilityPage />} />
          <Route path="reservations" element={<ReservationsPage />} />
          <Route element={<AdminRoute />}>
            <Route path="users" element={<UsersPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/availability" replace />} />
    </Routes>
  )
}
