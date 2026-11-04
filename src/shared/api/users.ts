import type {
  UserCreateDto,
  UserDto,
  UserPageDto,
  UserUpdateDto,
} from '../../types/api'
import { api } from './client'

export async function listUsers(params?: {
  page?: number
  size?: number
  q?: string
}): Promise<UserPageDto> {
  const { data } = await api.get<UserPageDto>('/users', { params })
  return data
}

export async function getUser(id: string): Promise<UserDto> {
  const { data } = await api.get<UserDto>(`/users/${id}`)
  return data
}

export async function createUser(body: UserCreateDto): Promise<UserDto> {
  const { data } = await api.post<UserDto>('/users', body)
  return data
}

export async function updateUser(id: string, body: UserUpdateDto): Promise<UserDto> {
  const { data } = await api.put<UserDto>(`/users/${id}`, body)
  return data
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/users/${id}`)
}

export async function getUserRoles(userId: string): Promise<string[]> {
  const { data } = await api.get<string[]>(`/users/${userId}/roles`)
  return data
}

export async function replaceUserRoles(
  userId: string,
  roles: string[],
): Promise<string[]> {
  const { data } = await api.put<string[]>(`/users/${userId}/roles`, { roles })
  return data
}
