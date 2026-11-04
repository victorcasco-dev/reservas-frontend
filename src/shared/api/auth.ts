import type { CurrentUserResponse, TokenResponse } from '../../types/api'
import { api } from './client'

export async function login(email: string, password: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>('/auth/login', { email, password })
  return data
}

export async function fetchCurrentUser(): Promise<CurrentUserResponse> {
  const { data } = await api.get<CurrentUserResponse>('/auth/me')
  return data
}
