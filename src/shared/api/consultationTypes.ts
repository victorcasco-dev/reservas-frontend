import type { CatalogDto, CatalogRequestDto, PageResponseDto } from '../../types/api'
import { api } from './client'

export async function listConsultationTypes(params?: {
  page?: number
  size?: number
}): Promise<PageResponseDto<CatalogDto>> {
  const { data } = await api.get<PageResponseDto<CatalogDto>>('/consultation-types', { params })
  return data
}

export async function searchConsultationTypes(params?: {
  name?: string
  active?: boolean
  page?: number
  size?: number
}): Promise<PageResponseDto<CatalogDto>> {
  const { data } = await api.get<PageResponseDto<CatalogDto>>('/consultation-types/search', {
    params,
  })
  return data
}

export async function createConsultationType(body: CatalogRequestDto): Promise<CatalogDto> {
  const { data } = await api.post<CatalogDto>('/consultation-types', body)
  return data
}

export async function updateConsultationType(id: string, body: CatalogRequestDto): Promise<CatalogDto> {
  const { data } = await api.put<CatalogDto>(`/consultation-types/${id}`, body)
  return data
}

/** Borrado lógico: el tipo queda inactivo. */
export async function deactivateConsultationType(id: string): Promise<CatalogDto> {
  const { data } = await api.delete<CatalogDto>(`/consultation-types/${id}`)
  return data
}
