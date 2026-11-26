import { useEffect, useId, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CatalogDto, ReservationDetailCreateDto, TimeSlotDto } from '../../types/api'
import { parseApiError } from '../../shared/api/client'
import { listConsultationTypes } from '../../shared/api/consultationTypes'
import { createReservation } from '../../shared/api/reservations'
import { newLocalId } from '../../shared/id'
import { longDate } from '../../shared/format'

interface DetailRow extends ReservationDetailCreateDto {
  rowId: string
}

function newDetailRow(): DetailRow {
  return { rowId: newLocalId(), consultationTypeId: '', comment: '' }
}

interface BookSlotDialogProps {
  slot: TimeSlotDto | null
  professorName: string
  studentId: string
  onClose: () => void
  onBooked: () => void
}

/**
 * Reserva directa desde la pantalla de disponibilidad: cabecera (turno elegido) y detalle
 * (uno o más motivos de consulta con comentario) en una sola petición.
 */
export function BookSlotDialog({ slot, professorName, studentId, onClose, onBooked }: BookSlotDialogProps) {
  const titleId = useId()
  const [types, setTypes] = useState<CatalogDto[]>([])
  const [rows, setRows] = useState<DetailRow[]>([newDetailRow()])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!slot) return
    setRows([newDetailRow()])
    void listConsultationTypes({ page: 0, size: 100 })
      .then((page) => setTypes((page.content ?? []).filter((t) => t.active)))
      .catch((e) => toast.error(parseApiError(e)))
  }, [slot])

  useEffect(() => {
    if (!slot) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [slot, saving, onClose])

  if (!slot) return null

  function updateRow(rowId: string, patch: Partial<DetailRow>) {
    setRows((r) => r.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!slot) return
    const ids = rows.map((r) => r.consultationTypeId)
    if (new Set(ids).size !== ids.length) {
      toast.error('Hay un motivo de consulta repetido.')
      return
    }
    setSaving(true)
    try {
      await createReservation({
        studentId,
        timeSlotId: slot.id,
        details: rows.map(({ consultationTypeId, comment }) => ({
          consultationTypeId,
          comment: comment?.trim() || undefined,
        })),
      })
      toast.success('¡Turno reservado! Te llegará la confirmación por correo.')
      onBooked()
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="confirm-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <div
        className="confirm-dialog confirm-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="confirm-dialog-title">
          Reservar turno
        </h2>
        <div className="mb-4 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
          <p className="font-semibold text-ink">{professorName}</p>
          <p className="text-muted">
            {longDate(slot.slotDate)} · {slot.startTime.slice(0, 5)} a {slot.endTime.slice(0, 5)}
          </p>
        </div>
        <form className="stack-form" onSubmit={(e) => void onSubmit(e)}>
          <div className="form-section">
            <div className="section-head">
              <h2>Motivos de consulta</h2>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={rows.length >= types.length}
                onClick={() => setRows((r) => [...r, newDetailRow()])}
              >
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
                      onChange={(e) => updateRow(row.rowId, { consultationTypeId: e.target.value })}
                    >
                      <option value="">Seleccionar tipo…</option>
                      {types.map((t) => (
                        <option
                          key={t.id}
                          value={t.id}
                          disabled={rows.some((r) => r.rowId !== row.rowId && r.consultationTypeId === t.id)}
                        >
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Comentario (opcional)</span>
                    <input
                      maxLength={500}
                      value={row.comment ?? ''}
                      onChange={(e) => updateRow(row.rowId, { comment: e.target.value })}
                      placeholder="Contexto breve para la tutoría"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label={`Quitar motivo ${index + 1}`}
                    disabled={rows.length === 1}
                    onClick={() => setRows((r) => r.filter((x) => x.rowId !== row.rowId))}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="confirm-dialog-actions">
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>
              Volver
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || types.length === 0}>
              {saving ? 'Reservando…' : 'Confirmar reserva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
