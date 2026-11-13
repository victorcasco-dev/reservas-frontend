import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { ContactInquiryCreateDto } from '../../types/api'
import { sendContactInquiry } from '../../shared/api/contact'
import { parseApiError } from '../../shared/api/client'
import { useAuth } from '../auth/AuthContext'

const initialForm: ContactInquiryCreateDto = { name: '', email: '', message: '' }

export function ContactPage() {
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const { isAuthenticated, loading } = useAuth()

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await sendContactInquiry({
        name: form.name.trim(),
        email: form.email.trim(),
        message: form.message.trim(),
      })
      toast.success('Tu mensaje fue enviado. Gracias por contactarnos.')
      setForm(initialForm)
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  // El formulario de contacto es solo para quien todavía no inició sesión.
  if (!loading && isAuthenticated) {
    return <Navigate to="/availability" replace />
  }

  return (
    <main className="contact-shell">
      <section className="contact-panel">
        <div className="contact-heading">
          <span className="sidebar-mark" aria-hidden />
          <div>
            <h1>Contacto</h1>
            <p className="page-lead">Dejanos tu consulta y el equipo se pondrá en contacto.</p>
          </div>
        </div>
        <form className="stack-form" onSubmit={(event) => void onSubmit(event)}>
          <label className="field">
            <span>Nombre</span>
            <input
              autoComplete="name"
              maxLength={120}
              required
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Correo electrónico</span>
            <input
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Mensaje</span>
            <textarea
              required
              maxLength={5000}
              rows={7}
              value={form.message}
              onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
            />
            <small className="field-hint">{form.message.length}/5000 caracteres</small>
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Enviando…' : 'Enviar consulta'}
          </button>
          <p className="contact-back-link">
            <Link to="/login">Volver al inicio de sesión</Link>
          </p>
        </form>
      </section>
    </main>
  )
}
