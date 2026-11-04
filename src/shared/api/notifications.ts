import type { NotificationDto, PageResponseDto } from '../../types/api'
import { api } from './client'

export async function listNotifications(params?: {
  page?: number
  size?: number
}): Promise<PageResponseDto<NotificationDto>> {
  const { data } = await api.get<PageResponseDto<NotificationDto>>('/notifications', { params })
  return data
}
