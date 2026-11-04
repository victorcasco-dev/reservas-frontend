import type { UserPageDto } from '../../types/api'
import { api } from './client'

export async function listProfessors(params?: {
  page?: number
  size?: number
}): Promise<UserPageDto> {
  const { data } = await api.get<UserPageDto>('/professors', {
    params: { page: params?.page ?? 0, size: params?.size ?? 100, active: true },
  })
  return data
}
