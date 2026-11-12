import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Bell, FileText, Plus, RefreshCw, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type {
  EmailTemplateDto,
  NotificationDto,
  NotificationType,
  UserDto,
} from '../../types/api'
import {
  createEmailTemplate,
  deactivateEmailTemplate,
  searchEmailTemplates,
  searchNotifications,
  sendNotification,
  updateEmailTemplate,
} from '../../shared/api/notifications'
import { listUsers } from '../../shared/api/users'
import { parseApiError } from '../../shared/api/client'

const PAGE_SIZE = 10
const TYPES: NotificationType[] = [
  'RESERVATION_CONFIRMATION',
  'REMINDER',
  'CANCELLATION',
  'CONTACT',
]
const STATUSES: Array<{ value: NotificationDto['status'] | ''; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'SENT', label: 'Enviada' },
  { value: 'ERROR', label: 'Error' },
]

type Section = 'history' | 'templates' | 'send'
interface TemplateForm {
  code: string
  subject: string
  htmlBody: string
}

const emptyTemplate = (): TemplateForm => ({ code: '', subject: '', htmlBody: '' })

function notificationTypeLabel(type: NotificationType): string {
  switch (type) {
    case 'RESERVATION_CONFIRMATION':
      return 'Confirmación de reserva'
    case 'REMINDER':
      return 'Recordatorio'
    case 'CANCELLATION':
      return 'Cancelación'
    case 'CONTACT':
      return 'Contacto'
  }
}

function notificationStatusLabel(status: NotificationDto['status']): string {
  return STATUSES.find((item) => item.value === status)?.label ?? status
}

function parsePayload(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('El contenido debe ser un objeto JSON.')
  }
  return parsed as Record<string, unknown>
}

export function NotificationsPage() {
  const [section, setSection] = useState<Section>('history')
  const [notifications, setNotifications] = useState<NotificationDto[]>([])
  const [templates, setTemplates] = useState<EmailTemplateDto[]>([])
  const [users, setUsers] = useState<UserDto[]>([])
  const [notificationType, setNotificationType] = useState<NotificationType | ''>('')
  const [notificationStatus, setNotificationStatus] = useState<NotificationDto['status'] | ''>('')
  const [templateQuery, setTemplateQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [notificationPage, setNotificationPage] = useState(0)
  const [templatePage, setTemplatePage] = useState(0)
  const [notificationPages, setNotificationPages] = useState(0)
  const [templatePages, setTemplatePages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplateDto | null>(null)
  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplate)
  const [recipientId, setRecipientId] = useState('')
  const [sendType, setSendType] = useState<NotificationType>('REMINDER')
  const [payload, setPayload] = useState('{}')

  const userNames = useMemo(
    () => new Map(users.map((user) => [user.id, `${user.firstName} ${user.lastName} · ${user.email}`])),
    [users],
  )

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const result = await searchNotifications({
        page: notificationPage,
        size: PAGE_SIZE,
        type: notificationType || undefined,
        status: notificationStatus || undefined,
      })
      setNotifications(result.content ?? [])
      setNotificationPages(result.page?.totalPages ?? 0)
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setLoading(false)
    }
  }, [notificationPage, notificationStatus, notificationType])

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const result = await searchEmailTemplates({
        page: templatePage,
        size: PAGE_SIZE,
        text: templateQuery.trim() || undefined,
        active: activeFilter === 'all' ? undefined : activeFilter === 'active',
      })
      setTemplates(result.content ?? [])
      setTemplatePages(result.page?.totalPages ?? 0)
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setLoading(false)
    }
  }, [activeFilter, templatePage, templateQuery])

  useEffect(() => {
    if (section === 'history') void loadNotifications()
    if (section === 'templates') void loadTemplates()
  }, [loadNotifications, loadTemplates, section])

  useEffect(() => {
    if (section !== 'send' || users.length) return
    void listUsers({ page: 0, size: 100 })
      .then((result) => setUsers((result.content ?? []).filter((user) => user.active)))
      .catch((error: unknown) => toast.error(parseApiError(error)))
  }, [section, users.length])

  function selectTemplate(template: EmailTemplateDto) {
    setSelectedTemplate(template)
    setTemplateForm({
      code: template.code,
      subject: template.subject,
      htmlBody: template.htmlBody,
    })
  }

  function resetTemplateForm() {
    setSelectedTemplate(null)
    setTemplateForm(emptyTemplate())
  }

  async function submitTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      const body = {
        code: templateForm.code.trim().toUpperCase(),
        subject: templateForm.subject.trim(),
        htmlBody: templateForm.htmlBody,
        active: selectedTemplate?.active ?? true,
      }
      if (selectedTemplate) {
        await updateEmailTemplate(selectedTemplate.id, body)
        toast.success('Plantilla actualizada')
      } else {
        await createEmailTemplate(body)
        toast.success('Plantilla creada')
      }
      resetTemplateForm()
      await loadTemplates()
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setSaving(false)
    }
  }

  async function onDeactivateTemplate() {
    if (!selectedTemplate || !selectedTemplate.active) return
    if (!window.confirm(`¿Desactivar la plantilla ${selectedTemplate.code}?`)) return
    setSaving(true)
    try {
      await deactivateEmailTemplate(selectedTemplate.id)
      toast.success('Plantilla desactivada')
      resetTemplateForm()
      await loadTemplates()
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setSaving(false)
    }
  }

  async function submitNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!recipientId) {
      toast.error('Seleccioná el destinatario.')
      return
    }
    let parsedPayload: Record<string, unknown>
    try {
      parsedPayload = parsePayload(payload)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'El contenido JSON no es válido.')
      return
    }

    setSaving(true)
    try {
      await sendNotification({ userId: recipientId, type: sendType, payload: parsedPayload })
      toast.success('Notificación procesada')
      setSection('history')
      setNotificationPage(0)
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Notificaciones</h1>
          <p className="page-lead">
            Revisá el historial de envíos, administrá las plantillas de correo y realizá envíos
            manuales.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void (section === 'templates' ? loadTemplates() : loadNotifications())}
        >
          <RefreshCw size={16} aria-hidden />
          Actualizar
        </button>
      </header>

      <nav className="screen-tabs" aria-label="Secciones de notificaciones">
        <button type="button" className={section === 'history' ? 'active' : ''} onClick={() => setSection('history')}>
          <Bell size={16} aria-hidden /> Historial
        </button>
        <button type="button" className={section === 'templates' ? 'active' : ''} onClick={() => setSection('templates')}>
          <FileText size={16} aria-hidden /> Plantillas
        </button>
        <button type="button" className={section === 'send' ? 'active' : ''} onClick={() => setSection('send')}>
          <Send size={16} aria-hidden /> Enviar
        </button>
      </nav>

      {section === 'history' && (
        <section className="panel notifications-panel" aria-label="Historial de notificaciones">
          <div className="panel-toolbar filters-toolbar notification-filters">
            <label className="field field-compact">
              <span>Tipo</span>
              <select
                value={notificationType}
                onChange={(event) => {
                  setNotificationType(event.target.value as NotificationType | '')
                  setNotificationPage(0)
                }}
              >
                <option value="">Todos los tipos</option>
                {TYPES.map((type) => <option key={type} value={type}>{notificationTypeLabel(type)}</option>)}
              </select>
            </label>
            <label className="field field-compact">
              <span>Estado</span>
              <select
                value={notificationStatus}
                onChange={(event) => {
                  setNotificationStatus(event.target.value as NotificationDto['status'] | '')
                  setNotificationPage(0)
                }}
              >
                {STATUSES.map((status) => <option key={status.value || 'all'} value={status.value}>{status.label}</option>)}
              </select>
            </label>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr><th>Tipo</th><th>Destinatario</th><th>Estado</th><th>Enviado</th><th>Detalle</th></tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={5} className="table-empty">Cargando notificaciones…</td></tr>}
                {!loading && notifications.length === 0 && <tr><td colSpan={5} className="table-empty">No hay notificaciones con estos filtros.</td></tr>}
                {!loading && notifications.map((notification) => (
                  <tr key={notification.id}>
                    <td>{notificationTypeLabel(notification.type)}</td>
                    <td>{userNames.get(notification.userId) ?? notification.userId}</td>
                    <td>
                      <span className={`badge badge-notification-${notification.status.toLowerCase()}`}>
                        {notificationStatusLabel(notification.status)}
                      </span>
                    </td>
                    <td>{notification.sentAt ? new Date(notification.sentAt).toLocaleString('es') : '—'}</td>
                    <td className="notification-error">{notification.errorMessage || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={notificationPage}
            totalPages={notificationPages}
            loading={loading}
            onChange={setNotificationPage}
          />
        </section>
      )}

      {section === 'templates' && (
        <div className="master-detail">
          <section className="panel panel-list" aria-label="Plantillas de correo">
            <div className="panel-toolbar template-toolbar">
              <input
                type="search"
                placeholder="Buscar código o asunto…"
                aria-label="Buscar plantillas"
                value={templateQuery}
                onChange={(event) => {
                  setTemplateQuery(event.target.value)
                  setTemplatePage(0)
                }}
              />
              <label className="field field-compact template-status-filter">
                <span>Estado</span>
                <select
                  value={activeFilter}
                  onChange={(event) => {
                    setActiveFilter(event.target.value as typeof activeFilter)
                    setTemplatePage(0)
                  }}
                >
                  <option value="all">Todas</option>
                  <option value="active">Activas</option>
                  <option value="inactive">Inactivas</option>
                </select>
              </label>
              <button type="button" className="btn btn-primary btn-sm" onClick={resetTemplateForm}>
                <Plus size={16} aria-hidden /> Nueva
              </button>
            </div>
            <ul className="entity-list">
              {loading && <li className="entity-list-empty">Cargando plantillas…</li>}
              {!loading && templates.length === 0 && <li className="entity-list-empty">No hay plantillas.</li>}
              {!loading && templates.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    className={`entity-row ${selectedTemplate?.id === template.id ? 'selected' : ''}`}
                    onClick={() => selectTemplate(template)}
                  >
                    <span className="entity-row-title">{template.code}</span>
                    <span className="entity-row-meta">{template.subject}</span>
                    <span className={`badge ${template.active ? 'badge-status-available' : 'badge-status-cancelled'}`}>
                      {template.active ? 'Activa' : 'Inactiva'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination
              page={templatePage}
              totalPages={templatePages}
              loading={loading}
              onChange={setTemplatePage}
            />
          </section>
          <section className="panel panel-form" aria-label="Editar plantilla">
            <form className="stack-form" onSubmit={(event) => void submitTemplate(event)}>
              <div className="form-section">
                <div className="section-head">
                  <h2>{selectedTemplate ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
                  {selectedTemplate?.active && (
                    <button type="button" className="btn btn-danger btn-sm" disabled={saving} onClick={() => void onDeactivateTemplate()}>
                      <Trash2 size={15} aria-hidden /> Desactivar
                    </button>
                  )}
                </div>
                <div className="field-grid">
                  <label className="field field-span-2">
                    <span>Código (A-Z, 0-9 y _)</span>
                    <input
                      required
                      maxLength={80}
                      pattern="[A-Z0-9_]+"
                      value={templateForm.code}
                      disabled={!!selectedTemplate}
                      onChange={(event) => setTemplateForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                    />
                  </label>
                  <label className="field field-span-2">
                    <span>Asunto</span>
                    <input
                      required
                      maxLength={255}
                      value={templateForm.subject}
                      disabled={!!selectedTemplate && !selectedTemplate.active}
                      onChange={(event) => setTemplateForm((current) => ({ ...current, subject: event.target.value }))}
                    />
                  </label>
                  <label className="field field-span-2">
                    <span>Cuerpo HTML</span>
                    <textarea
                      required
                      rows={10}
                      value={templateForm.htmlBody}
                      disabled={!!selectedTemplate && !selectedTemplate.active}
                      onChange={(event) => setTemplateForm((current) => ({ ...current, htmlBody: event.target.value }))}
                    />
                  </label>
                </div>
              </div>
              <div className="form-actions">
                {selectedTemplate && (
                  <button type="button" className="btn btn-secondary" disabled={saving} onClick={resetTemplateForm}>Cancelar edición</button>
                )}
                <button type="submit" className="btn btn-primary" disabled={saving || (!!selectedTemplate && !selectedTemplate.active)}>
                  {saving ? 'Guardando…' : selectedTemplate ? 'Guardar cambios' : 'Crear plantilla'}
                </button>
              </div>
              {selectedTemplate && !selectedTemplate.active && (
                <p className="field-hint">Las plantillas inactivas no se pueden editar. Creá una plantilla con otro código para reemplazarla.</p>
              )}
            </form>
          </section>
        </div>
      )}

      {section === 'send' && (
        <section className="panel panel-form notification-send-panel" aria-label="Enviar notificación">
          <form className="stack-form" onSubmit={(event) => void submitNotification(event)}>
            <div className="form-section">
              <h2>Envío manual</h2>
              <p className="section-description">
                Se utilizará la plantilla activa cuyo código coincide con el tipo seleccionado.
              </p>
              <div className="field-grid">
                <label className="field field-span-2">
                  <span>Destinatario</span>
                  <select required value={recipientId} onChange={(event) => setRecipientId(event.target.value)}>
                    <option value="">Seleccionar usuario…</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{userNames.get(user.id)}</option>)}
                  </select>
                </label>
                <label className="field field-span-2">
                  <span>Tipo de notificación</span>
                  <select value={sendType} onChange={(event) => setSendType(event.target.value as NotificationType)}>
                    {TYPES.map((type) => <option key={type} value={type}>{notificationTypeLabel(type)} · {type}</option>)}
                  </select>
                </label>
                <label className="field field-span-2">
                  <span>Datos de la plantilla (JSON)</span>
                  <textarea
                    rows={8}
                    spellCheck={false}
                    value={payload}
                    onChange={(event) => setPayload(event.target.value)}
                    aria-describedby="payload-hint"
                  />
                  <small id="payload-hint" className="field-hint">
                    Ejemplo: {`{"name":"Ana","date":"2026-11-20"}`}
                  </small>
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving || !users.length}>
                <Send size={16} aria-hidden />
                {saving ? 'Enviando…' : 'Enviar notificación'}
              </button>
            </div>
            {!users.length && <p className="field-hint">No hay usuarios activos disponibles como destinatarios.</p>}
          </form>
        </section>
      )}
    </div>
  )
}

function Pagination({
  page,
  totalPages,
  loading,
  onChange,
}: {
  page: number
  totalPages: number
  loading: boolean
  onChange: (page: number) => void
}) {
  return (
    <div className="pagination-bar">
      <span>Página {page + 1}{totalPages ? ` de ${totalPages}` : ''}</span>
      <div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={page === 0 || loading} onClick={() => onChange(page - 1)}>
          Anterior
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={loading || page + 1 >= totalPages} onClick={() => onChange(page + 1)}>
          Siguiente
        </button>
      </div>
    </div>
  )
}
