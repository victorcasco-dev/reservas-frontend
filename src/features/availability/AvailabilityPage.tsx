import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CircleX, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { TimeSlotDto, UserDto } from '../../types/api'
import { parseApiError } from '../../shared/api/client'
import { createTimeSlot, deleteTimeSlot, listTimeSlots } from '../../shared/api/availability'
import { listProfessors } from '../../shared/api/professors'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useAuth } from '../auth/AuthContext'

interface HeaderForm {
  professorId: string
  slotDate: string
}

interface DetailRow {
  id: string
  startTime: string
  endTime: string
}

function newRow(): DetailRow {
  return {
    id: crypto.randomUUID(),
    startTime: '09:00',
    endTime: '09:30',
  }
}

function statusLabel(status: TimeSlotDto['status']): string {
  switch (status) {
    case 'AVAILABLE':
      return 'Disponible'
    case 'BOOKED':
      return 'Reservado'
    case 'CANCELLED':
      return 'Cancelado'
  }
}

export function AvailabilityPage() {
  const { canManageAvailability } = useAuth()
  const [slots, setSlots] = useState<TimeSlotDto[]>([])
  const [professors, setProfessors] = useState<UserDto[]>([])
  const [header, setHeader] = useState<HeaderForm>({
    professorId: '',
    slotDate: new Date().toISOString().slice(0, 10),
  })
  const [rows, setRows] = useState<DetailRow[]>([newRow()])
  const [filterProfessorId, setFilterProfessorId] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [slotToCancel, setSlotToCancel] = useState<TimeSlotDto | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const professorMap = useMemo(() => {
    const map = new Map<string, UserDto>()
    for (const p of professors) {
      map.set(p.id, p)
    }
    return map
  }, [professors])

  const loadSlots = useCallback(async () => {
    setLoading(true)
    try {
      const page = await listTimeSlots({
        page: 0,
        size: 100,
        professorId: filterProfessorId || undefined,
        date: filterDate || undefined,
      })
      setSlots(page.content ?? [])
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setLoading(false)
    }
  }, [filterProfessorId, filterDate])

  useEffect(() => {
    void loadSlots()
  }, [loadSlots])

  useEffect(() => {
    void listProfessors().then((p) => {
      const list = p.content ?? []
      setProfessors(list)
      setHeader((h) => (h.professorId ? h : { ...h, professorId: list[0]?.id ?? '' }))
    })
  }, [])

  function addRow() {
    setRows((r) => [...r, newRow()])
  }

  function updateRow(id: string, patch: Partial<DetailRow>) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function removeRow(id: string) {
    setRows((r) => (r.length <= 1 ? r : r.filter((row) => row.id !== id)))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!header.professorId) {
      toast.error('Elegí un profesor antes de publicar.')
      return
    }
    setSaving(true)
    try {
      for (const row of rows) {
        await createTimeSlot({
          professorId: header.professorId,
          slotDate: header.slotDate,
          startTime: row.startTime,
          endTime: row.endTime,
        })
      }
      toast.success(
        rows.length === 1
          ? 'Turno creado'
          : `${rows.length} turnos creados para la misma fecha`,
      )
      setRows([newRow()])
      await loadSlots()
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setSaving(false)
    }
  }

  function requestCancelSlot(slot: TimeSlotDto) {
    if (slot.status === 'CANCELLED') {
      return
    }
    setSlotToCancel(slot)
  }

  async function confirmCancelSlot() {
    if (!slotToCancel) {
      return
    }
    setCancelling(true)
    try {
      await deleteTimeSlot(slotToCancel.id)
      toast.success('Turno cancelado')
      setSlotToCancel(null)
      await loadSlots()
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setCancelling(false)
    }
  }

  const cancelDialogDescription = slotToCancel
    ? slotToCancel.status === 'BOOKED'
      ? `El turno del ${slotToCancel.slotDate} (${slotToCancel.startTime.slice(0, 5)}–${slotToCancel.endTime.slice(0, 5)}) está reservado. Al cancelarlo, dejás de ofrecer esa franja.`
      : `Vas a cancelar el turno del ${slotToCancel.slotDate}, ${slotToCancel.startTime.slice(0, 5)}–${slotToCancel.endTime.slice(0, 5)}.`
    : ''

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Disponibilidad</h1>
          <p className="page-lead">
            {canManageAvailability
              ? 'Elegí profesor y fecha, cargá una o más franjas horarias y publicá todo desde esta pantalla.'
              : 'Consultá los turnos publicados por profesor y fecha. Para reservar, usá la pantalla de reservas cuando esté disponible.'}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void loadSlots()}>
          <RefreshCw size={16} aria-hidden />
          Actualizar turnos
        </button>
      </header>

      <div
        className={`master-detail${canManageAvailability ? '' : ' master-detail--single'}`}
      >
        <section className="panel panel-list" aria-label="Turnos existentes">
          <div className="panel-toolbar filters-toolbar">
            <label className="field field-compact">
              <span>Profesor</span>
              <select
                value={filterProfessorId}
                onChange={(e) => setFilterProfessorId(e.target.value)}
              >
                <option value="">Todos</option>
                {professors.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-compact">
              <span>Fecha</span>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </label>
          </div>
          <ul className="entity-list">
            {loading && <li className="entity-list-empty">Cargando…</li>}
            {!loading && slots.length === 0 && (
              <li className="entity-list-empty">No hay turnos con estos filtros.</li>
            )}
            {slots.map((slot) => {
              const prof = professorMap.get(slot.professorId)
              return (
                <li key={slot.id}>
                  <div className="slot-row">
                    <div className="slot-row-main">
                      <span className="entity-row-title">
                        {slot.slotDate} · {slot.startTime.slice(0, 5)}–
                        {slot.endTime.slice(0, 5)}
                      </span>
                      <span className="entity-row-meta">
                        {prof ? `${prof.firstName} ${prof.lastName}` : slot.professorId}
                      </span>
                    </div>
                    <div className="slot-row-actions">
                      <span className={`badge badge-status-${slot.status.toLowerCase()}`}>
                        {statusLabel(slot.status)}
                      </span>
                      {canManageAvailability && slot.status !== 'CANCELLED' && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm slot-row-cancel"
                          onClick={() => requestCancelSlot(slot)}
                        >
                          <CircleX size={15} aria-hidden />
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        {canManageAvailability && (
        <section className="panel panel-form" aria-label="Alta de turnos">
          <form className="stack-form" onSubmit={(e) => void onSubmit(e)}>
            <div className="form-section">
              <h2>Profesor y fecha</h2>
              <div className="field-grid">
                <label className="field field-span-2">
                  <span>Profesor</span>
                  <select
                    required
                    value={header.professorId}
                    onChange={(e) => setHeader({ ...header, professorId: e.target.value })}
                  >
                    <option value="" disabled>
                      Seleccionar…
                    </option>
                    {professors.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Fecha</span>
                  <input
                    type="date"
                    required
                    value={header.slotDate}
                    onChange={(e) => setHeader({ ...header, slotDate: e.target.value })}
                  />
                </label>
              </div>
            </div>

            <div className="form-section">
              <div className="section-head">
                <h2>Franjas horarias</h2>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addRow}>
                  <Plus size={16} aria-hidden />
                  Agregar fila
                </button>
              </div>
              <div className="detail-table-wrap">
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th>Inicio</th>
                      <th>Fin</th>
                      <th aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <input
                            type="time"
                            required
                            value={row.startTime}
                            onChange={(e) => updateRow(row.id, { startTime: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="time"
                            required
                            value={row.endTime}
                            onChange={(e) => updateRow(row.id, { endTime: e.target.value })}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            aria-label="Quitar fila"
                            onClick={() => removeRow(row.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Publicando…' : 'Publicar turnos'}
              </button>
            </div>
          </form>
        </section>
        )}
      </div>

      {canManageAvailability && (
      <ConfirmDialog
        open={slotToCancel !== null}
        title="¿Cancelar este turno?"
        description={cancelDialogDescription}
        confirmLabel="Sí, cancelar turno"
        cancelLabel="No, volver"
        confirming={cancelling}
        onCancel={() => {
          if (!cancelling) {
            setSlotToCancel(null)
          }
        }}
        onConfirm={() => void confirmCancelSlot()}
      />
      )}
    </div>
  )
}
