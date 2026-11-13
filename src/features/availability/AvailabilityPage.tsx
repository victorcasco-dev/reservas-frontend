import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CircleX, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { TimeSlotDto, TimeSlotStatus, UserDto } from '../../types/api'
import { parseApiError } from '../../shared/api/client'
import { createTimeSlotsBatch, deleteTimeSlot, listTimeSlots } from '../../shared/api/availability'
import { listProfessors } from '../../shared/api/professors'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Pagination } from '../../shared/ui/Pagination'
import { SearchInput } from '../../shared/ui/SearchInput'
import { useAuth } from '../auth/AuthContext'
import { dateParts, durationMinutes, filterControl, filterLabel, longDate } from '../../shared/format'

const PAGE_SIZE = 10

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

type Period = 'UPCOMING' | 'PAST'

function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "Hoy" / "Mañana" para los encabezados de día. */
function relativeDay(day: string): string | null {
  const today = new Date()
  if (day === isoDay(today)) return 'Hoy'
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  return day === isoDay(tomorrow) ? 'Mañana' : null
}

/** Colores y texto por estado; un turno libre de un día pasado se muestra como vencido. */
function slotLook(status: TimeSlotDto['status'], isPast: boolean) {
  if (status === 'BOOKED') {
    return { label: 'Reservado', bar: 'bg-amber-400', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-800', row: '' }
  }
  if (status === 'CANCELLED') {
    return { label: 'Cancelado', bar: 'bg-gray-300', dot: 'bg-gray-400', pill: 'bg-gray-100 text-gray-600', row: 'opacity-60' }
  }
  if (isPast) {
    return { label: 'Sin reservar', bar: 'bg-gray-300', dot: 'bg-gray-400', pill: 'bg-gray-100 text-gray-600', row: 'opacity-70' }
  }
  return { label: 'Disponible', bar: 'bg-emerald-500', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-800', row: '' }
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
  const [filterStatus, setFilterStatus] = useState<TimeSlotStatus | ''>('')
  const [period, setPeriod] = useState<Period>('UPCOMING')
  const todayIso = isoDay(new Date())
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState<number | undefined>()
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
      const result = await listTimeSlots({
        page,
        size: PAGE_SIZE,
        professorId: filterProfessorId || undefined,
        date: filterDate || undefined,
        status: filterStatus || undefined,
        period: filterDate ? undefined : period,
        q: query || undefined,
      })
      setSlots(result.content ?? [])
      setTotalPages(result.page?.totalPages ?? 0)
      setTotalElements(result.page?.totalElements)
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setLoading(false)
    }
  }, [filterProfessorId, filterDate, filterStatus, page, period, query])

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

  /** Turnos agrupados por día (el backend ya los devuelve ordenados por fecha y hora). */
  const groupedSlots = useMemo(() => {
    const groups = new Map<string, TimeSlotDto[]>()
    for (const slot of slots) {
      const list = groups.get(slot.slotDate) ?? []
      list.push(slot)
      groups.set(slot.slotDate, list)
    }
    return [...groups.entries()]
  }, [slots])

  const hasFilters = Boolean(query || filterProfessorId || filterDate || filterStatus)

  function clearFilters() {
    setQuery('')
    setFilterProfessorId('')
    setFilterDate('')
    setFilterStatus('')
    setPage(0)
  }

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
      // Una sola petición con el DTO compuesto (cabecera + franjas).
      await createTimeSlotsBatch({
        professorId: header.professorId,
        slotDate: header.slotDate,
        slots: rows.map(({ startTime, endTime }) => ({ startTime, endTime })),
      })
      toast.success(
        rows.length === 1
          ? 'Turno creado'
          : `${rows.length} turnos creados para la misma fecha`,
      )
      setRows([newRow()])
      setPage(0)
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
        <section
          className="panel flex min-h-[420px] flex-col lg:h-[calc(100vh-11rem)]"
          aria-label="Turnos existentes"
        >
          <div className="flex flex-col gap-2 border-b border-line bg-white/65 p-3">
            <SearchInput
              value={query}
              placeholder="Buscar por nombre del profesor…"
              label="Buscar turnos"
              onChange={(value) => {
                setQuery(value)
                setPage(0)
              }}
            />
            <div className="flex rounded-lg bg-[#efe9df] p-1" role="tablist" aria-label="Período">
              {(
                [
                  ['UPCOMING', 'Próximos'],
                  ['PAST', 'Pasados'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={period === value && !filterDate}
                  disabled={Boolean(filterDate)}
                  onClick={() => {
                    setPeriod(value)
                    setPage(0)
                  }}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    period === value && !filterDate
                      ? 'bg-white text-ink shadow-sm'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className={filterLabel}>
                Profesor
                <select
                  className={filterControl}
                  value={filterProfessorId}
                  onChange={(e) => {
                    setFilterProfessorId(e.target.value)
                    setPage(0)
                  }}
                >
                  <option value="">Todos</option>
                  {professors.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </option>
                  ))}
                </select>
              </label>
              <label className={filterLabel}>
                Fecha
                <input
                  type="date"
                  className={filterControl}
                  value={filterDate}
                  onChange={(e) => {
                    setFilterDate(e.target.value)
                    setPage(0)
                  }}
                />
              </label>
              <label className={filterLabel}>
                Estado
                <select
                  className={filterControl}
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value as TimeSlotStatus | '')
                    setPage(0)
                  }}
                >
                  <option value="">Todos</option>
                  <option value="AVAILABLE">Disponibles</option>
                  <option value="BOOKED">Reservados</option>
                  <option value="CANCELLED">Cancelados</option>
                </select>
              </label>
            </div>
            {hasFilters && (
              <button
                type="button"
                className="inline-flex items-center gap-1 self-end rounded-md px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent-soft"
                onClick={clearFilters}
              >
                <X size={13} aria-hidden />
                Limpiar filtros
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f6f2ea] p-3">
            {loading && <p className="entity-list-empty">Cargando turnos…</p>}
            {!loading && slots.length === 0 && (
              <p className="entity-list-empty">
                {period === 'UPCOMING' && !filterDate
                  ? 'No hay turnos próximos con estos filtros.'
                  : 'No hay turnos con estos filtros.'}
              </p>
            )}
            {!loading &&
              groupedSlots.map(([day, daySlots]) => {
                const date = dateParts(day)
                const relative = relativeDay(day)
                const isPast = day < todayIso
                const free = daySlots.filter((slot) => slot.status === 'AVAILABLE').length
                return (
                  <article
                    key={day}
                    className="overflow-hidden rounded-xl border border-line bg-white shadow-sm"
                    aria-label={longDate(day)}
                  >
                    <header className="flex items-center gap-3 border-b border-line/70 bg-surface px-3 py-2">
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-accent text-white">
                        <span className="text-[0.6rem] font-semibold uppercase leading-none">{date.month}</span>
                        <span className="font-display text-lg leading-tight">{date.day}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {longDate(day)}
                          {relative && (
                            <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-semibold uppercase text-accent">
                              {relative}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          {daySlots.length} {daySlots.length === 1 ? 'turno' : 'turnos'}
                          {!isPast && ` · ${free} ${free === 1 ? 'libre' : 'libres'}`}
                        </p>
                      </div>
                    </header>
                    <ul className="m-0 list-none divide-y divide-line/50 p-0">
                      {daySlots.map((slot) => {
                        const prof = professorMap.get(slot.professorId)
                        const professorName =
                          slot.professorName ??
                          (prof ? `${prof.firstName} ${prof.lastName}` : 'Profesor')
                        const look = slotLook(slot.status, isPast)
                        return (
                          <li key={slot.id} className={`flex items-center gap-3 py-2 pr-2 pl-0 ${look.row}`}>
                            <span className={`w-1 self-stretch rounded-r ${look.bar}`} aria-hidden />
                            <div className="w-24 shrink-0">
                              <p className="text-sm font-semibold tabular-nums text-ink">
                                {slot.startTime.slice(0, 5)} – {slot.endTime.slice(0, 5)}
                              </p>
                              <p className="text-[0.7rem] text-muted">
                                {durationMinutes(slot.startTime, slot.endTime)} min
                              </p>
                            </div>
                            <p className="min-w-0 flex-1 truncate text-sm text-ink">{professorName}</p>
                            <span
                              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${look.pill}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${look.dot}`} aria-hidden />
                              {look.label}
                            </span>
                            {canManageAvailability && (
                              <span className="w-8 shrink-0">
                                {slot.status !== 'CANCELLED' && !isPast && (
                                  <button
                                    type="button"
                                    className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                                    title="Cancelar turno"
                                    aria-label={`Cancelar turno de las ${slot.startTime.slice(0, 5)} del ${longDate(slot.slotDate)}`}
                                    onClick={() => requestCancelSlot(slot)}
                                  >
                                    <CircleX size={16} aria-hidden />
                                  </button>
                                )}
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </article>
                )
              })}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            totalElements={totalElements}
            loading={loading}
            onChange={setPage}
          />
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
