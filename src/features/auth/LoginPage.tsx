import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { parseApiError } from '../../shared/api/client'
import { useAuth } from './AuthContext'

export function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/availability'

  const [email, setEmail] = useState('admin@reservas.local')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && isAuthenticated) {
    return <Navigate to={from} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      toast.success('Sesión iniciada')
      navigate(from, { replace: true })
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-panel">
        <div className="login-brand">
          <span className="login-mark" aria-hidden />
          <div>
            <h1>Tutorías y tesis</h1>
            <p className="login-lead">
              Accedé con tu cuenta para gestionar usuarios y disponibilidad a través del
              gateway.
            </p>
          </div>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Correo</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Iniciar sesión'}
          </button>
          <p className="login-contact-link">
            ¿Necesitás ayuda? <Link to="/contact">Contactá al equipo</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
