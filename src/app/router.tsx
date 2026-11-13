import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { LoginPage } from '../features/auth/LoginPage'
import { AvailabilityPage } from '../features/availability/AvailabilityPage'
import { UsersPage } from '../features/users/UsersPage'
import { ReservationsPage } from '../features/reservations/ReservationsPage'
import { NotificationsPage } from '../features/notifications/NotificationsPage'
import { ConsultationTypesPage } from '../features/consultationTypes/ConsultationTypesPage'
import { ContactPage } from '../features/contact/ContactPage'
import { NotFoundPage, ServerErrorPage } from '../features/errors/ErrorPage'
import { ProtectedRoute } from './ProtectedRoute'
import { AdminRoute } from './AdminRoute'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/error" element={<ServerErrorPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/availability" replace />} />
          <Route path="availability" element={<AvailabilityPage />} />
          <Route path="reservations" element={<ReservationsPage />} />
          <Route element={<AdminRoute />}>
            <Route path="users" element={<UsersPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="consultation-types" element={<ConsultationTypesPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
