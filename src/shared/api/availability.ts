import type {
  TimeSlotBatchCreateDto,
  TimeSlotCreateDto,
  TimeSlotDto,
  TimeSlotPageDto,
  TimeSlotStatus,
} from '../../types/api'
import { api } from './client'

export async function listTimeSlots(params?: {
  page?: number
  size?: number
  professorId?: string
  date?: string
  status?: TimeSlotStatus
  q?: string
  /** UPCOMING (desde hoy, ascendente) o PAST (antes de hoy, descendente). */
  period?: 'UPCOMING' | 'PAST'
}): Promise<TimeSlotPageDto> {
  const { data } = await api.get<TimeSlotPageDto>('/time-slots', { params })
  return data
}

export async function createTimeSlot(body: TimeSlotCreateDto): Promise<TimeSlotDto> {
  const { data } = await api.post<TimeSlotDto>('/time-slots', body)
  return data
}

/** Cabecera-detalle en una sola petición: todas las franjas se guardan juntas o ninguna. */
export async function createTimeSlotsBatch(body: TimeSlotBatchCreateDto): Promise<TimeSlotDto[]> {
  const { data } = await api.post<TimeSlotDto[]>('/time-slots/batch', body)
  return data
}

export async function deleteTimeSlot(id: string): Promise<void> {
  await api.delete(`/time-slots/${id}`)
}
