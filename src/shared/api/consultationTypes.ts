import type { CatalogDto, PageResponseDto } from '../../types/api'
import { api } from './client'

export async function listConsultationTypes(params?: {
  page?: number
  size?: number
}): Promise<PageResponseDto<CatalogDto>> {
  const { data } = await api.get<PageResponseDto<CatalogDto>>('/consultation-types', { params })
  return data
}

export async function searchConsultationTypes(params?: {
  active?: boolean
  page?: number
  size?: number
}): Promise<PageResponseDto<CatalogDto>> {
  const { data } = await api.get<PageResponseDto<CatalogDto>>('/consultation-types/search', {
    params,
  })
  return data
}
