import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CircleX, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { isAxiosError } from 'axios'
import type {
  CatalogDto,
  ReservationDto,
  ReservationDetailCreateDto,
  ReservationStatus,
  TimeSlotDto,
  UserDto,
} from '../../types/api'
import { parseApiError } from '../../shared/api/client'
import { listTimeSlots } from '../../shared/api/availability'
import { listConsultationTypes } from '../../shared/api/consultationTypes'
import { listProfessors } from '../../shared/api/professors'
import {
  cancelReservation,
  createReservation,
  searchReservations,
  updateReservation,
} from '../../shared/api/reservations'
import { listUsers } from '../../shared/api/users'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Pagination } from '../../shared/ui/Pagination'
import { SearchInput } from '../../shared/ui/SearchInput'
import { useAuth } from '../auth/AuthContext'
import { dateParts, filterControl as baseFilterControl } from '../../shared/format'

const PAGE_SIZE = 10
const STATUS_OPTIONS: Array<{ value: ReservationStatus | ''; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'CONFIRMED', label: 'Confirmada' },
  { value: 'CANCELLED', label: 'Cancelada' },
  { value: 'COMPLETED', label: 'Completada' },
]

interface DetailRow extends ReservationDetailCreateDto {
  rowId: string
}

function newDetailRow(): DetailRow {
  return { rowId: crypto.randomUUID(), consultationTypeId: '', comment: '' }
}

function reservationStatusLabel(status: ReservationStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(date)
}

export function ReservationsPage() {
  const { user, isAdministrator } = useAuth()
  const isStudent = user?.roles.includes('STUDENT') ?? false
  const isProfessor = user?.roles.includes('PROFESSOR') ?? false
  const canCreate = isStudent || isAdministrator

  const [reservations, setReservations] = useState<ReservationDto[]>([])
  const [students, setStudents] = useState<UserDto[]>([])
  const [professors, setProfessors] = useState<UserDto[]>([])
  const [types, setTypes] = useState<CatalogDto[]>([])
  const [availableSlots, setAvailableSlots] = useState<TimeSlotDto[]>([])
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState<number | undefined>()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<ReservationDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [studentId, setStudentId] = useState(isStudent ? (user?.userId ?? '') : '')
  const [slotId, setSlotId] = useState('')
  const [rows, setRows] = useState<DetailRow[]>([newDetailRow()])
  const [slotDateFilter, setSlotDateFilter] = useState('')
  const [reservationToCancel, setReservationToCancel] = useState<ReservationDto | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const professorNames = useMemo(
    () => new Map(professors.map((professor) => [professor.id, `${professor.firstName} ${professor.lastName}`])),
    [professors],
  )
  const studentsById = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  )

  const loadReservations = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const result = await searchReservations({
        page,
        size: PAGE_SIZE,
        studentId: !isAdministrator && isStudent ? user.userId : undefined,
        professorId: !isAdministrator && !isStudent && isProfessor ? user.userId : undefined,
        status: statusFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        q: query || undefined,
      })
      setReservations(result.content ?? [])
      setTotalPages(result.page?.totalPages ?? 0)
      setTotalElements(result.page?.totalElements)
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, isAdministrator, isProfessor, isStudent, page, query, statusFilter, user])

  const loadBookingOptions = useCallback(async () => {
    setLoadingOptions(true)
    try {
      const [slotPage, typePage] = await Promise.all([
        listTimeSlots({ page: 0, size: 100, status: 'AVAILABLE', date: slotDateFilter || undefined }),
        listConsultationTypes({ page: 0, size: 100 }),
      ])
      setAvailableSlots((slotPage.content ?? []).filter((slot) => slot.status === 'AVAILABLE'))
      setTypes((typePage.content ?? []).filter((type) => type.active))
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setLoadingOptions(false)
    }
  }, [slotDateFilter])

  useEffect(() => {
    void loadReservations()
  }, [loadReservations])

  useEffect(() => {
    if (!canCreate) return
    void loadBookingOptions()
  }, [canCreate, loadBookingOptions])

  useEffect(() => {
    void listProfessors({ page: 0, size: 100 })
      .then((result) => setProfessors(result.content ?? []))
      .catch((error: unknown) => toast.error(parseApiError(error)))
    if (!isAdministrator) return
    void listUsers({ page: 0, size: 100 })
      .then((result) => {
        setStudents((result.content ?? []).filter((entry) => entry.type === 'STUDENT' && entry.active))
      })
      .catch((error: unknown) => toast.error(parseApiError(error)))
  }, [isAdministrator])

  /** Opciones del select de turno: los libres más el turno actual si se está editando. */
  const slotOptions = useMemo(() => {
    if (!editing || availableSlots.some((slot) => slot.id === editing.timeSlot.id)) {
      return availableSlots
    }
    return [editing.timeSlot, ...availableSlots]
  }, [availableSlots, editing])

  function startEdit(reservation: ReservationDto) {
    setEditing(reservation)
    setStudentId(reservation.studentId)
    setSlotId(reservation.timeSlot.id)
    setRows(
      reservation.details.map((detail) => ({
        rowId: crypto.randomUUID(),
        consultationTypeId: detail.consultationType.id,
        comment: detail.comment ?? '',
      })),
    )
  }

  function resetForm() {
    setEditing(null)
    setRows([newDetailRow()])
    setSlotId('')
    if (isAdministrator) setStudentId('')
  }

  function updateDetail(rowId: string, patch: Partial<DetailRow>) {
    setRows((current) => current.map((row) => row.rowId === rowId ? { ...row, ...patch } : row))
  }

  async function submitReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!studentId || !slotId || rows.some((row) => !row.consultationTypeId)) {
      toast.error('Completá el estudiante, el turno y al menos un tipo de consulta.')
      return
    }
    setSaving(true)
    // Cabecera (estudiante + turno) y detalles viajan juntos en un único DTO compuesto.
    const body = {
      studentId,
      timeSlotId: slotId,
      details: rows.map(({ consultationTypeId, comment }) => ({
        consultationTypeId,
        comment: comment?.trim() || undefined,
      })),
    }
    try {
      if (editing) {
        await updateReservation(editing.id, body)
        toast.success('Reserva actualizada')
      } else {
        await createReservation(body)
        toast.success('Reserva creada')
        setPage(0)
      }
      resetForm()
      await Promise.all([loadReservations(), loadBookingOptions()])
    } catch (error) {
      toast.error(parseApiError(error))
      if (isAxiosError(error) && error.response?.status === 409) {
        await loadBookingOptions()
      }
    } finally {
      setSaving(false)
    }
  }

  async function confirmCancelReservation() {
    if (!reservationToCancel) return
    setCancelling(true)
    try {
      await cancelReservation(reservationToCancel.id)
      toast.success('Reserva cancelada; el turno quedó disponible nuevamente.')
      setReservationToCancel(null)
      await Promise.all([loadReservations(), loadBookingOptions()])
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setCancelling(false)
    }
  }

  const hasFilters = Boolean(query || statusFilter || dateFrom || dateTo)

  function clearFilters() {
    setQuery('')
    setStatusFilter('')
    setDateFrom('')
    setDateTo('')
    setPage(0)
  }

  const filterControl = baseFilterControl

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Reservas</h1>
          <p className="page-lead">
            Consultá las reservas y, si sos estudiante, elegí un turno disponible y agregá los
            tipos de consulta en una sola operación.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void loadReservations()}>
          <RefreshCw size={16} aria-hidden />
          Actualizar
        </button>
      </header>

      <div className={`master-detail${canCreate ? '' : ' master-detail--single'}`}>
        <section
          className="panel flex min-h-[420px] flex-col lg:h-[calc(100vh-11rem)]"
          aria-label="Listado de reservas"
        >
          <div className="flex flex-col gap-2 border-b border-line bg-white/65 p-3">
            <SearchInput
              value={query}
              placeholder="Buscar por estudiante, profesor o tipo…"
              label="Buscar reservas"
              onChange={(value) => {
                setQuery(value)
                setPage(0)
              }}
            />
            <div className="grid grid-cols-3 gap-2">
              <label className="flex min-w-0 flex-col gap-0.5 text-[0.7rem] font-medium text-muted">
                Estado
                <select
                  className={`${filterControl} w-full`}
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as ReservationStatus | '')
                    setPage(0)
                  }}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-0.5 text-[0.7rem] font-medium text-muted">
                Desde
                <input
                  type="date"
                  className={`${filterControl} w-full`}
                  value={dateFrom}
                  onChange={(event) => {
                    setDateFrom(event.target.value)
                    setPage(0)
                  }}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-0.5 text-[0.7rem] font-medium text-muted">
                Hasta
                <input
                  type="date"
                  className={`${filterControl} w-full`}
                  value={dateTo}
                  onChange={(event) => {
                    setDateTo(event.target.value)
                    setPage(0)
                  }}
                />
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

          <ul className="m-0 min-h-0 flex-1 list-none divide-y divide-line/70 overflow-y-auto p-0">
            {loading && <li className="entity-list-empty">Cargando reservas…</li>}
            {!loading && reservations.length === 0 && (
              <li className="entity-list-empty">No hay reservas que coincidan con los filtros.</li>
            )}
            {!loading && reservations.map((reservation) => {
              const isOwner = isAdministrator
                || (isStudent && reservation.studentId === user?.userId)
                || (isProfessor && reservation.timeSlot.professorId === user?.userId)
              const canCancel = isOwner && ['PENDING', 'CONFIRMED'].includes(reservation.status)
              const canEdit = canCancel && canCreate
              const student = studentsById.get(reservation.studentId)
              const studentName =
                reservation.studentName ??
                (student ? `${student.firstName} ${student.lastName}` : 'Estudiante')
              const professorName =
                reservation.timeSlot.professorName ??
                professorNames.get(reservation.timeSlot.professorId) ??
                'Profesor'
              const date = dateParts(reservation.timeSlot.slotDate)
              const inactive = ['CANCELLED', 'COMPLETED'].includes(reservation.status)
              const isEditing = editing?.id === reservation.id
              return (
                <li
                  key={reservation.id}
                  className={`flex items-start gap-3 px-3 py-2.5 transition ${
                    isEditing
                      ? 'bg-accent-soft shadow-[inset_3px_0_0_var(--color-accent)]'
                      : 'hover:bg-white/80'
                  } ${inactive ? 'opacity-70' : ''}`}
                >
                  <div
                    className="flex w-12 shrink-0 flex-col items-center rounded-lg border border-line bg-white py-1 leading-tight"
                    title={formatDate(reservation.timeSlot.slotDate)}
                  >
                    <span className="text-[0.65rem] font-semibold uppercase text-muted">{date.month}</span>
                    <span className="font-display text-lg font-semibold text-ink">{date.day}</span>
                    <span className="text-[0.6rem] text-muted">{date.year}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink">
                        {reservation.timeSlot.startTime.slice(0, 5)}–{reservation.timeSlot.endTime.slice(0, 5)}
                        {' · '}
                        {professorName}
                      </span>
                      <span
                        className={`badge badge-reservation-${reservation.status.toLowerCase()} ml-auto shrink-0`}
                      >
                        {reservationStatusLabel(reservation.status)}
                      </span>
                    </div>
                    {(isAdministrator || isProfessor) && (
                      <p className="truncate text-xs text-muted">Estudiante: {studentName}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {reservation.details.map((detail) => (
                        <span
                          key={detail.id}
                          title={detail.comment || undefined}
                          className="inline-flex max-w-full items-center rounded-full bg-accent-soft px-2 py-0.5 text-[0.7rem] font-medium text-accent"
                        >
                          <span className="truncate">{detail.consultationType.name}</span>
                          {detail.comment && <span className="ml-1 text-accent/60">•</span>}
                        </span>
                      ))}
                    </div>
                  </div>

                  {(canEdit || canCancel) && (
                    <div className="flex shrink-0 flex-col gap-1">
                      {canEdit && (
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-muted hover:bg-accent-soft hover:text-accent"
                          title="Editar reserva"
                          aria-label={`Editar reserva del ${formatDate(reservation.timeSlot.slotDate)}`}
                          onClick={() => startEdit(reservation)}
                        >
                          <Pencil size={15} aria-hidden />
                        </button>
                      )}
                      {canCancel && (
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                          title="Cancelar reserva"
                          aria-label={`Cancelar reserva del ${formatDate(reservation.timeSlot.slotDate)}`}
                          onClick={() => setReservationToCancel(reservation)}
                        >
                          <CircleX size={15} aria-hidden />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <Pagination
            page={page}
            totalPages={totalPages}
            totalElements={totalElements}
            loading={loading}
            onChange={setPage}
          />
        </section>

        {canCreate && (
          <section className="panel panel-form" aria-label="Crear una reserva">
            <form className="stack-form" onSubmit={(event) => void submitReservation(event)}>
              <div className="form-section">
                <h2>{editing ? 'Editar reserva' : 'Nueva reserva'}</h2>
                <p className="section-description">
                  Seleccioná un turno libre y uno o más motivos de consulta.
                </p>
                <div className="field-grid">
                  {isAdministrator && (
                    <label className="field field-span-2">
                      <span>Estudiante</span>
                      <select required value={studentId} onChange={(event) => setStudentId(event.target.value)}>
                        <option value="">Seleccionar estudiante…</option>
                        {editing && !studentsById.has(editing.studentId) && (
                          <option value={editing.studentId}>
                            {editing.studentName ?? 'Estudiante de la reserva'}
                          </option>
                        )}
                        {students.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.firstName} {student.lastName} · {student.email}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="field">
                    <span>Fecha del turno</span>
                    <input type="date" value={slotDateFilter} onChange={(event) => setSlotDateFilter(event.target.value)} />
                  </label>
                  <label className="field field-span-2">
                    <span>Turno disponible</span>
                    <select required value={slotId} onChange={(event) => setSlotId(event.target.value)} disabled={loadingOptions}>
                      <option value="">{loadingOptions ? 'Cargando turnos…' : 'Seleccionar turno…'}</option>
                      {slotOptions.map((slot) => (
                        <option key={slot.id} value={slot.id}>
                          {formatDate(slot.slotDate)} · {slot.startTime.slice(0, 5)}–{slot.endTime.slice(0, 5)}
                          {' · '}{slot.professorName ?? professorNames.get(slot.professorId) ?? 'Profesor'}
                        </option>
                      ))}
                    </select>
                    {!loadingOptions && availableSlots.length === 0 && (
                      <small className="field-hint">No hay turnos libres para esa fecha.</small>
                    )}
                  </label>
                </div>
              </div>

              <div className="form-section">
                <div className="section-head">
                  <h2>Motivos de consulta</h2>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows((current) => [...current, newDetailRow()])}>
                    <Plus size={16} aria-hidden />
                    Agregar
                  </button>
                </div>
                <div className="reservation-details-form">
                  {rows.map((row, index) => (
                    <div className="reservation-detail-row" key={row.rowId}>
                      <label className="field">
                        <span>Tipo {index + 1}</span>
                        <select
                          required
                          value={row.consultationTypeId}
                          onChange={(event) => updateDetail(row.rowId, { consultationTypeId: event.target.value })}
                        >
                          <option value="">Seleccionar tipo…</option>
                          {types.map((type) => (
                            <option key={type.id} value={type.id}>{type.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Comentario (opcional)</span>
                        <input
                          maxLength={500}
                          value={row.comment ?? ''}
                          onChange={(event) => updateDetail(row.rowId, { comment: event.target.value })}
                          placeholder="Contexto breve para la tutoría"
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        aria-label={`Quitar motivo ${index + 1}`}
                        disabled={rows.length === 1}
                        onClick={() => setRows((current) => current.filter((entry) => entry.rowId !== row.rowId))}
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
                {types.length === 0 && !loadingOptions && (
                  <p className="field-hint">No hay tipos activos. Consultá al administrador del sistema.</p>
                )}
              </div>

              <div className="form-actions">
                {editing && (
                  <button type="button" className="btn btn-secondary" disabled={saving} onClick={resetForm}>
                    Cancelar edición
                  </button>
                )}
                <button type="submit" className="btn btn-primary" disabled={saving || loadingOptions}>
                  {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Confirmar reserva'}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>

      <ConfirmDialog
        open={reservationToCancel !== null}
        title="¿Cancelar esta reserva?"
        description={reservationToCancel
          ? `Se cancelará la reserva del ${formatDate(reservationToCancel.timeSlot.slotDate)} a las ${reservationToCancel.timeSlot.startTime.slice(0, 5)}. El turno volverá a estar disponible.`
          : ''}
        confirmLabel="Sí, cancelar"
        cancelLabel="Volver"
        confirming={cancelling}
        onCancel={() => {
          if (!cancelling) setReservationToCancel(null)
        }}
        onConfirm={() => void confirmCancelReservation()}
      />
    </div>
  )
}
