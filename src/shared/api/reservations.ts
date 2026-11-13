import type {
  PageResponseDto,
  ReservationCreateDto,
  ReservationDto,
  ReservationStatus,
} from '../../types/api'
import { api } from './client'

export async function listReservations(params?: {
  page?: number
  size?: number
}): Promise<PageResponseDto<ReservationDto>> {
  const { data } = await api.get<PageResponseDto<ReservationDto>>('/reservations', { params })
  return data
}

export async function searchReservations(params?: {
  studentId?: string
  professorId?: string
  consultationTypeId?: string
  status?: ReservationStatus
  dateFrom?: string
  dateTo?: string
  q?: string
  page?: number
  size?: number
}): Promise<PageResponseDto<ReservationDto>> {
  const { data } = await api.get<PageResponseDto<ReservationDto>>('/reservations/search', {
    params,
  })
  return data
}

export async function getReservation(id: string): Promise<ReservationDto> {
  const { data } = await api.get<ReservationDto>(`/reservations/${id}`)
  return data
}

export async function createReservation(body: ReservationCreateDto): Promise<ReservationDto> {
  const { data } = await api.post<ReservationDto>('/reservations', body)
  return data
}

export async function updateReservation(
  id: string,
  body: ReservationCreateDto,
): Promise<ReservationDto> {
  const { data } = await api.put<ReservationDto>(`/reservations/${id}`, body)
  return data
}

export async function cancelReservation(id: string): Promise<ReservationDto> {
  const { data } = await api.post<ReservationDto>(`/reservations/${id}/cancellation`)
  return data
}
