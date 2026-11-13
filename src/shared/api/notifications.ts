import type {
  EmailTemplateDto,
  EmailTemplateRequestDto,
  NotificationDto,
  NotificationRequestDto,
  NotificationType,
  PageResponseDto,
} from '../../types/api'
import { api } from './client'

export async function listNotifications(params?: {
  page?: number
  size?: number
  userId?: string
  type?: NotificationType
  status?: NotificationDto['status']
}): Promise<PageResponseDto<NotificationDto>> {
  const { data } = await api.get<PageResponseDto<NotificationDto>>('/notifications', { params })
  return data
}

export async function searchNotifications(params?: {
  page?: number
  size?: number
  q?: string
  userId?: string
  type?: NotificationType
  status?: NotificationDto['status']
}): Promise<PageResponseDto<NotificationDto>> {
  const { data } = await api.get<PageResponseDto<NotificationDto>>('/notifications/search', {
    params,
  })
  return data
}

export async function sendNotification(body: NotificationRequestDto): Promise<NotificationDto> {
  const { data } = await api.post<NotificationDto>('/notifications', body)
  return data
}

export async function listEmailTemplates(params?: {
  page?: number
  size?: number
  text?: string
  active?: boolean
}): Promise<PageResponseDto<EmailTemplateDto>> {
  const { data } = await api.get<PageResponseDto<EmailTemplateDto>>('/email-templates', { params })
  return data
}

export async function searchEmailTemplates(params?: {
  page?: number
  size?: number
  text?: string
  active?: boolean
}): Promise<PageResponseDto<EmailTemplateDto>> {
  const { data } = await api.get<PageResponseDto<EmailTemplateDto>>('/email-templates/search', {
    params,
  })
  return data
}

export async function createEmailTemplate(
  body: EmailTemplateRequestDto,
): Promise<EmailTemplateDto> {
  const { data } = await api.post<EmailTemplateDto>('/email-templates', body)
  return data
}

export async function updateEmailTemplate(
  id: string,
  body: EmailTemplateRequestDto,
): Promise<EmailTemplateDto> {
  const { data } = await api.put<EmailTemplateDto>(`/email-templates/${id}`, body)
  return data
}

export async function deactivateEmailTemplate(id: string): Promise<EmailTemplateDto> {
  const { data } = await api.delete<EmailTemplateDto>(`/email-templates/${id}`)
  return data
}
