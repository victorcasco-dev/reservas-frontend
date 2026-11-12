import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
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
} from '../../shared/api/reservations'
import { listUsers } from '../../shared/api/users'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useAuth } from '../auth/AuthContext'

const PAGE_SIZE = 10
const STATUS_OPTIONS: Array<{ value: ReservationStatus | ''; label: string }> = [
  { value: '', label: 'Todos los estados' },
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
      })
      setReservations(result.content ?? [])
      setTotalPages(result.page?.totalPages ?? 0)
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, isAdministrator, isProfessor, isStudent, page, statusFilter, user])

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
    try {
      await createReservation({
        studentId,
        timeSlotId: slotId,
        details: rows.map(({ consultationTypeId, comment }) => ({
          consultationTypeId,
          comment: comment?.trim() || undefined,
        })),
      })
      toast.success('Reserva creada')
      setRows([newDetailRow()])
      setSlotId('')
      setPage(0)
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

  function applyFilters() {
    setPage(0)
    void loadReservations()
  }

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
        <section className="panel panel-list" aria-label="Listado de reservas">
          <div className="panel-toolbar filters-toolbar reservation-filters">
            <label className="field field-compact">
              <span>Estado</span>
              <select
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
            <label className="field field-compact">
              <span>Desde</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label className="field field-compact">
              <span>Hasta</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={applyFilters}>
              Filtrar
            </button>
          </div>

          <ul className="entity-list reservation-list">
            {loading && <li className="entity-list-empty">Cargando reservas…</li>}
            {!loading && reservations.length === 0 && (
              <li className="entity-list-empty">No hay reservas que coincidan con los filtros.</li>
            )}
            {reservations.map((reservation) => {
              const isOwner = isAdministrator
                || (isStudent && reservation.studentId === user?.userId)
                || (isProfessor && reservation.timeSlot.professorId === user?.userId)
              const canCancel = isOwner && ['PENDING', 'CONFIRMED'].includes(reservation.status)
              const student = studentsById.get(reservation.studentId)
              return (
                <li key={reservation.id} className="reservation-list-item">
                  <article className="reservation-card">
                    <div className="reservation-card-head">
                      <div>
                        <strong>{formatDate(reservation.timeSlot.slotDate)}</strong>
                        <span className="entity-row-meta">
                          {reservation.timeSlot.startTime.slice(0, 5)}–{reservation.timeSlot.endTime.slice(0, 5)}
                        </span>
                      </div>
                      <span className={`badge badge-reservation-${reservation.status.toLowerCase()}`}>
                        {reservationStatusLabel(reservation.status)}
                      </span>
                    </div>
                    <p className="reservation-card-meta">
                      Profesor: {professorNames.get(reservation.timeSlot.professorId) ?? reservation.timeSlot.professorId}
                    </p>
                    {(isAdministrator || isProfessor) && (
                      <p className="reservation-card-meta">
                        Estudiante: {student ? `${student.firstName} ${student.lastName}` : reservation.studentId}
                      </p>
                    )}
                    <ul className="reservation-detail-list">
                      {reservation.details.map((detail) => (
                        <li key={detail.id}>
                          <span>{detail.consultationType.name}</span>
                          {detail.comment && <small>{detail.comment}</small>}
                        </li>
                      ))}
                    </ul>
                    {canCancel && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setReservationToCancel(reservation)}
                      >
                        Cancelar reserva
                      </button>
                    )}
                  </article>
                </li>
              )
            })}
          </ul>
          <div className="pagination-bar">
            <span>Página {page + 1}{totalPages ? ` de ${totalPages}` : ''}</span>
            <div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page === 0 || loading}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={loading || page + 1 >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        </section>

        {canCreate && (
          <section className="panel panel-form" aria-label="Crear una reserva">
            <form className="stack-form" onSubmit={(event) => void submitReservation(event)}>
              <div className="form-section">
                <h2>Nueva reserva</h2>
                <p className="section-description">
                  Seleccioná un turno libre y uno o más motivos de consulta.
                </p>
                <div className="field-grid">
                  {isAdministrator && (
                    <label className="field field-span-2">
                      <span>Estudiante</span>
                      <select required value={studentId} onChange={(event) => setStudentId(event.target.value)}>
                        <option value="">Seleccionar estudiante…</option>
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
                      {availableSlots.map((slot) => (
                        <option key={slot.id} value={slot.id}>
                          {formatDate(slot.slotDate)} · {slot.startTime.slice(0, 5)}–{slot.endTime.slice(0, 5)}
                          {' · '}{professorNames.get(slot.professorId) ?? `Profesor ${slot.professorId.slice(0, 8)}`}
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
                <button type="submit" className="btn btn-primary" disabled={saving || loadingOptions}>
                  {saving ? 'Guardando…' : 'Confirmar reserva'}
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
