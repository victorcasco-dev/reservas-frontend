import type {
  CatalogDto,
  ExperienceLevel,
  PageResponseDto,
  ProfessorResearchLineDto,
} from '../../types/api'
import { api } from './client'

/** Catálogo de líneas de investigación activas (para el desplegable). */
export async function listActiveResearchLines(): Promise<CatalogDto[]> {
  const { data } = await api.get<CatalogDto[]>('/catalogs/research-lines')
  return data
}

/** Todas las asociaciones profesor ↔ línea (tabla intermedia), opcionalmente de un profesor. */
export async function listProfessorResearchLines(params?: {
  professorId?: string
  size?: number
}): Promise<ProfessorResearchLineDto[]> {
  const { data } = await api.get<PageResponseDto<ProfessorResearchLineDto>>('/professor-research-lines', {
    params: { page: 0, size: params?.size ?? 100, professorId: params?.professorId },
  })
  return data.content ?? []
}

export async function addProfessorResearchLine(
  professorId: string,
  body: { researchLineId: string; experienceLevel: ExperienceLevel },
): Promise<ProfessorResearchLineDto> {
  const { data } = await api.post<ProfessorResearchLineDto>(`/professors/${professorId}/research-lines`, body)
  return data
}

export async function updateProfessorResearchLine(
  id: string,
  experienceLevel: ExperienceLevel,
): Promise<ProfessorResearchLineDto> {
  const { data } = await api.put<ProfessorResearchLineDto>(`/professor-research-lines/${id}`, { experienceLevel })
  return data
}

export async function removeProfessorResearchLine(professorId: string, detailId: string): Promise<void> {
  await api.delete(`/professors/${professorId}/research-lines/${detailId}`)
}
